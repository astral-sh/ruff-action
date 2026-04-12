import * as path from "node:path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as semver from "semver";
import {
  downloadVersion,
  tryGetFromToolCache,
} from "./download/download-version";
import {
  args,
  checkSum,
  githubToken,
  manifestFile,
  src,
  version,
  versionFile as versionFileInput,
} from "./utils/inputs";
import {
  type Architecture,
  getArch,
  getPlatform,
  type Platform,
} from "./utils/platforms";
import { resolveRuffVersion } from "./version/resolve";

async function run(): Promise<void> {
  const platform = getPlatform();
  const arch = getArch();

  try {
    if (platform === undefined) {
      throw new Error(`Unsupported platform: ${process.platform}`);
    }
    if (arch === undefined) {
      throw new Error(`Unsupported architecture: ${process.arch}`);
    }
    const setupResult = await setupRuff(platform, arch, checkSum, githubToken);

    addRuffToPath(setupResult.ruffDir);
    setOutputFormat();
    addMatchers();
    core.setOutput("ruff-version", setupResult.version);
    core.info(`Successfully installed ruff version ${setupResult.version}`);

    await runRuff(
      path.join(setupResult.ruffDir, "ruff"),
      args.split(" "),
      src.split(" "),
    );

    process.exit(0);
  } catch (err) {
    core.setFailed((err as Error).message);
  }
}

async function setupRuff(
  platform: Platform,
  arch: Architecture,
  checkSum: string | undefined,
  githubToken: string,
): Promise<{ ruffDir: string; version: string }> {
  const resolvedVersion = await determineVersion();
  const manifestUrl = manifestFile || undefined;
  if (semver.lt(resolvedVersion, "v0.0.247")) {
    throw Error(
      "This action does not support ruff versions older than 0.0.247",
    );
  }
  const toolCacheResult = tryGetFromToolCache(arch, resolvedVersion);
  if (toolCacheResult.installedPath) {
    core.info(`Found ruffDir in tool-cache for ${toolCacheResult.version}`);
    return {
      ruffDir: toolCacheResult.installedPath,
      version: toolCacheResult.version,
    };
  }

  const downloadVersionResult = await downloadVersion(
    platform,
    arch,
    resolvedVersion,
    checkSum,
    githubToken,
    manifestUrl,
  );

  return {
    ruffDir: downloadVersionResult.cachedToolDir,
    version: downloadVersionResult.version,
  };
}

async function determineVersion(): Promise<string> {
  return await resolveRuffVersion({
    manifestFile: manifestFile || undefined,
    sourceDirectory: src,
    version,
    versionFile: versionFileInput,
    workspaceRoot: process.env.GITHUB_WORKSPACE || ".",
  });
}

function addRuffToPath(cachedPath: string): void {
  core.addPath(cachedPath);
  core.info(`Added ${cachedPath} to the path`);
}

function setOutputFormat() {
  core.exportVariable("RUFF_OUTPUT_FORMAT", "github");
  core.info("Set RUFF_OUTPUT_FORMAT to github");
}

function addMatchers(): void {
  const actionRoot = getActionRoot();
  const matchersPath = path.join(actionRoot, ".github", "matchers");
  core.info(`##[add-matcher]${path.join(matchersPath, "check.json")}`);
  core.info(`##[add-matcher]${path.join(matchersPath, "format.json")}`);
}

function getActionRoot(): string {
  const entrypoint = process.argv[1] ?? process.cwd();
  return path.resolve(path.dirname(entrypoint), "..", "..");
}

async function runRuff(
  ruffExecutablePath: string,
  args: string[],
  src: string[],
): Promise<void> {
  const execArgs = [...args, ...src];
  await exec.exec(ruffExecutablePath, execArgs);
}

run();
