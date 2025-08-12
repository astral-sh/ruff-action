import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import { Octokit } from "@octokit/core";
import { paginateRest } from "@octokit/plugin-paginate-rest";
import { restEndpointMethods } from "@octokit/plugin-rest-endpoint-methods";
import * as pep440 from "@renovatebot/pep440";
import * as semver from "semver";
import { OWNER, REPO, TOOL_CACHE_NAME } from "../utils/constants";
import type { Architecture, Platform } from "../utils/platforms";
import { validateChecksum } from "./checksum/checksum";

const PaginatingOctokit = Octokit.plugin(paginateRest, restEndpointMethods);

export function tryGetFromToolCache(
  arch: Architecture,
  version: string,
): { version: string; installedPath: string | undefined } {
  core.debug(`Trying to get ruff from tool cache for ${version}...`);
  const cachedVersions = tc.findAllVersions(TOOL_CACHE_NAME, arch);
  core.debug(`Cached versions: ${cachedVersions}`);
  let resolvedVersion = tc.evaluateVersions(cachedVersions, version);
  if (resolvedVersion === "") {
    resolvedVersion = version;
  }
  const installedPath = tc.find(TOOL_CACHE_NAME, resolvedVersion, arch);
  return { installedPath, version: resolvedVersion };
}

export async function downloadVersion(
  platform: Platform,
  arch: Architecture,
  version: string,
  checkSum: string | undefined,
  githubToken: string,
): Promise<{ version: string; cachedToolDir: string }> {
  const artifact = `ruff-${arch}-${platform}`;
  let extension = ".tar.gz";
  if (platform === "pc-windows-msvc") {
    extension = ".zip";
  }
  const downloadUrl = constructDownloadUrl(version, platform, arch);
  core.debug(`Downloading ruff from "${downloadUrl}" ...`);

  const downloadPath = await tc.downloadTool(
    downloadUrl,
    undefined,
    githubToken,
  );
  core.debug(`Downloaded ruff to "${downloadPath}"`);
  await validateChecksum(checkSum, downloadPath, arch, platform, version);

  const extractedDir = await extractDownloadedArtifact(
    version,
    downloadPath,
    extension,
    platform,
    artifact,
  );

  const cachedToolDir = await tc.cacheDir(
    extractedDir,
    TOOL_CACHE_NAME,
    version,
    arch,
  );
  return { cachedToolDir, version: version };
}

function constructDownloadUrl(
  version: string,
  platform: Platform,
  arch: Architecture,
): string {
  const artifactVersionSuffix =
    semver.lte(version, "v0.4.10") && semver.gte(version, "v0.1.8")
      ? `-${version}`
      : "";
  const artifact = `ruff${artifactVersionSuffix}-${arch}-${platform}`;
  let extension = ".tar.gz";
  if (platform === "pc-windows-msvc") {
    extension = ".zip";
  }
  const versionPrefix = semver.lte(version, "v0.4.10") ? "v" : "";
  return `https://github.com/${OWNER}/${REPO}/releases/download/${versionPrefix}${version}/${artifact}${extension}`;
}

async function extractDownloadedArtifact(
  version: string,
  downloadPath: string,
  extension: string,
  platform: Platform,
  artifact: string,
): Promise<string> {
  let ruffDir: string;
  if (platform === "pc-windows-msvc") {
    const fullPathWithExtension = `${downloadPath}${extension}`;
    await fs.copyFile(downloadPath, fullPathWithExtension);
    ruffDir = await tc.extractZip(fullPathWithExtension);
    // On windows extracting the zip does not create an intermediate directory
  } else {
    ruffDir = await tc.extractTar(downloadPath);
    if (semver.gte(version, "v0.5.0")) {
      // Since v0.5.0 an intermediate directory is created
      ruffDir = path.join(ruffDir, artifact);
    }
  }
  const files = await fs.readdir(ruffDir);
  core.debug(`Contents of ${ruffDir}: ${files.join(", ")}`);
  return ruffDir;
}

export async function resolveVersion(
  versionInput: string,
  githubToken: string,
): Promise<string> {
  core.debug(`Resolving ${versionInput}...`);
  const version =
    versionInput === "latest"
      ? await getLatestVersion(githubToken)
      : versionInput;
  if (tc.isExplicitVersion(version)) {
    core.debug(`Version ${version} is an explicit version.`);
    return version;
  }
  const availableVersions = await getAvailableVersions(githubToken);
  const resolvedVersion = maxSatisfying(availableVersions, version);
  if (resolvedVersion === undefined) {
    throw new Error(`No version found for ${version}`);
  }
  core.debug(`Resolved version: ${resolvedVersion}`);
  return resolvedVersion;
}

async function getAvailableVersions(githubToken: string): Promise<string[]> {
  try {
    const octokit = new PaginatingOctokit({
      auth: githubToken,
    });
    return await getReleaseTagNames(octokit);
  } catch (err) {
    if ((err as Error).message.includes("Bad credentials")) {
      core.info(
        "No (valid) GitHub token provided. Falling back to anonymous. Requests might be rate limited.",
      );
      const octokit = new PaginatingOctokit();
      return await getReleaseTagNames(octokit);
    }
    throw err;
  }
}

async function getReleaseTagNames(
  octokit: InstanceType<typeof PaginatingOctokit>,
): Promise<string[]> {
  const response = await octokit.paginate(octokit.rest.repos.listReleases, {
    owner: OWNER,
    repo: REPO,
  });
  const releaseTagNames = response.map((release) => release.tag_name);
  if (releaseTagNames.length === 0) {
    throw Error(
      "Github API request failed while getting releases. Check the GitHub status page for outages. Try again later.",
    );
  }
  return response.map((release) => release.tag_name);
}

async function getLatestVersion(githubToken: string) {
  const octokit = new PaginatingOctokit({
    auth: githubToken,
  });

  let latestRelease: { tag_name: string } | undefined;
  try {
    latestRelease = await getLatestRelease(octokit);
  } catch (err) {
    if ((err as Error).message.includes("Bad credentials")) {
      core.info(
        "No (valid) GitHub token provided. Falling back to anonymous. Requests might be rate limited.",
      );
      const octokit = new PaginatingOctokit();
      latestRelease = await getLatestRelease(octokit);
    } else {
      core.error(
        "Github API request failed while getting latest release. Check the GitHub status page for outages. Try again later.",
      );
      throw err;
    }
  }

  if (!latestRelease) {
    throw new Error("Could not determine latest release.");
  }
  return latestRelease.tag_name;
}

async function getLatestRelease(
  octokit: InstanceType<typeof PaginatingOctokit>,
) {
  const { data: latestRelease } = await octokit.rest.repos.getLatestRelease({
    owner: OWNER,
    repo: REPO,
  });
  return latestRelease;
}

function maxSatisfying(
  versions: string[],
  version: string,
): string | undefined {
  const maxSemver = tc.evaluateVersions(versions, version);
  if (maxSemver !== "") {
    core.debug(`Found a version that satisfies the semver range: ${maxSemver}`);
    return maxSemver;
  }
  const maxPep440 = pep440.maxSatisfying(versions, version);
  if (maxPep440 !== null) {
    core.debug(
      `Found a version that satisfies the pep440 specifier: ${maxPep440}`,
    );
    return maxPep440;
  }
  return undefined;
}
