import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as pep440 from "@renovatebot/pep440";
import * as semver from "semver";
import {
  ASTRAL_MIRROR_PREFIX,
  GITHUB_RELEASES_PREFIX,
  TOOL_CACHE_NAME,
  VERSIONS_MANIFEST_URL,
} from "../utils/constants";
import type { Architecture, Platform } from "../utils/platforms";
import { validateChecksum } from "./checksum/checksum";
import { getAllVersions, getArtifact, getLatestVersion } from "./manifest";

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
  checksum: string | undefined,
  githubToken: string,
  manifestUrl?: string,
): Promise<{ version: string; cachedToolDir: string }> {
  const artifact = await getArtifact(version, arch, platform, manifestUrl);

  if (!artifact) {
    throw new Error(
      getMissingArtifactMessage(version, arch, platform, manifestUrl),
    );
  }

  // For the default astral-sh/versions source, checksum validation relies on
  // user input or the built-in KNOWN_CHECKSUMS table, not manifest sha256 values.
  const resolvedChecksum =
    manifestUrl === undefined
      ? checksum
      : resolveChecksum(checksum, artifact.checksum);

  const downloadPath = await downloadArtifact(
    artifact.downloadUrl,
    platform,
    arch,
    version,
    getDownloadToken(artifact.downloadUrl, githubToken),
  );
  await validateChecksum(
    resolvedChecksum,
    downloadPath,
    arch,
    platform,
    version,
  );

  const extractedDir = await extractDownloadedArtifact(
    version,
    downloadPath,
    getExtension(platform),
    platform,
    `ruff-${arch}-${platform}`,
  );

  const cachedToolDir = await tc.cacheDir(
    extractedDir,
    TOOL_CACHE_NAME,
    version,
    arch,
  );
  return { cachedToolDir, version };
}

export function rewriteToMirror(url: string): string | undefined {
  if (!url.startsWith(GITHUB_RELEASES_PREFIX)) {
    return undefined;
  }

  return ASTRAL_MIRROR_PREFIX + url.slice(GITHUB_RELEASES_PREFIX.length);
}

async function downloadArtifact(
  downloadUrl: string,
  platform: Platform,
  arch: Architecture,
  version: string,
  githubToken: string | undefined,
): Promise<string> {
  const mirrorUrl = rewriteToMirror(downloadUrl);
  const resolvedDownloadUrl = mirrorUrl ?? downloadUrl;

  try {
    return await downloadFile(
      resolvedDownloadUrl,
      mirrorUrl !== undefined ? undefined : githubToken,
    );
  } catch (err) {
    if (mirrorUrl === undefined) {
      throw err;
    }

    core.warning(
      `Failed to download from mirror, falling back to GitHub Releases: ${(err as Error).message}`,
    );

    return await downloadFile(
      constructDownloadUrl(version, platform, arch),
      githubToken,
    );
  }
}

async function downloadFile(
  downloadUrl: string,
  githubToken: string | undefined,
): Promise<string> {
  core.info(`Downloading ruff from "${downloadUrl}" ...`);
  const downloadPath = await tc.downloadTool(
    downloadUrl,
    undefined,
    githubToken,
  );
  core.debug(`Downloaded ruff to "${downloadPath}"`);
  return downloadPath;
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
    // On windows extracting the zip does not create an intermediate directory.
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
  manifestUrl?: string,
): Promise<string> {
  core.debug(`Resolving ${versionInput}...`);

  const version =
    versionInput === "latest"
      ? await getLatestVersion(manifestUrl)
      : versionInput;

  if (tc.isExplicitVersion(version)) {
    core.debug(`Version ${version} is an explicit version.`);
    return version;
  }

  const availableVersions = await getAvailableVersions(manifestUrl);
  const resolvedVersion = maxSatisfying(availableVersions, version);
  if (resolvedVersion === undefined) {
    throw new Error(`No version found for ${version}`);
  }
  core.debug(`Resolved version: ${resolvedVersion}`);
  return resolvedVersion;
}

async function getAvailableVersions(manifestUrl?: string): Promise<string[]> {
  return await getAllVersions(manifestUrl);
}

function getMissingArtifactMessage(
  version: string,
  arch: Architecture,
  platform: Platform,
  manifestUrl?: string,
): string {
  if (manifestUrl === undefined) {
    return `Could not find artifact for version ${version}, arch ${arch}, platform ${platform} in ${VERSIONS_MANIFEST_URL} .`;
  }

  return `manifest-file does not contain version ${version}, arch ${arch}, platform ${platform}.`;
}

function resolveChecksum(
  checksum: string | undefined,
  manifestChecksum: string,
): string {
  return checksum !== undefined && checksum !== ""
    ? checksum
    : manifestChecksum;
}

function getDownloadToken(
  downloadUrl: string,
  githubToken: string,
): string | undefined {
  return downloadUrl.startsWith(GITHUB_RELEASES_PREFIX)
    ? githubToken
    : undefined;
}

function constructDownloadUrl(
  version: string,
  platform: Platform,
  arch: Architecture,
): string {
  const normalizedVersion = stripVersionPrefix(version);
  const artifactVersionSuffix =
    semver.lte(version, "v0.4.10") && semver.gte(version, "v0.1.8")
      ? `-${normalizedVersion}`
      : "";
  const artifact = `ruff${artifactVersionSuffix}-${arch}-${platform}`;
  const versionPrefix = semver.lte(version, "v0.4.10") ? "v" : "";

  return `${GITHUB_RELEASES_PREFIX}${versionPrefix}${normalizedVersion}/${artifact}${getExtension(platform)}`;
}

function stripVersionPrefix(version: string): string {
  return version.startsWith("v") ? version.slice(1) : version;
}

function getExtension(platform: Platform): string {
  return platform === "pc-windows-msvc" ? ".zip" : ".tar.gz";
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
