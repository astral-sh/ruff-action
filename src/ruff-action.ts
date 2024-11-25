import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as path from "node:path";
import {
  downloadVersion,
  tryGetFromToolCache,
} from "./download/download-version";

import { downloadLatest } from "./download/download-latest";
import {
  type Architecture,
  getArch,
  getPlatform,
  type Platform,
} from "./utils/platforms";
import { args, checkSum, githubToken, src, version } from "./utils/inputs";

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
    const setupResult = await setupRuff(
      platform,
      arch,
      version,
      checkSum,
      githubToken,
    );

    addRuffToPath(setupResult.ruffDir);
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
  versionInput: string,
  checkSum: string | undefined,
  githubToken: string,
): Promise<{ ruffDir: string; version: string }> {
  let installedPath: string | undefined;
  let cachedToolDir: string;
  let version: string;
  if (versionInput === "latest") {
    const latestResult = await downloadLatest(
      platform,
      arch,
      checkSum,
      githubToken,
    );
    version = latestResult.version;
    cachedToolDir = latestResult.cachedToolDir;
  } else {
    const toolCacheResult = tryGetFromToolCache(arch, versionInput);
    version = toolCacheResult.version;
    installedPath = toolCacheResult.installedPath;
    if (installedPath) {
      core.info(`Found ruff in tool-cache for ${versionInput}`);
      return { ruffDir: installedPath, version };
    }
    const versionResult = await downloadVersion(
      platform,
      arch,
      versionInput,
      checkSum,
      githubToken,
    );
    cachedToolDir = versionResult.cachedToolDir;
    version = versionResult.version;
  }

  return { ruffDir: cachedToolDir, version };
}

function addRuffToPath(cachedPath: string): void {
  core.addPath(cachedPath);
  core.info(`Added ${cachedPath} to the path`);
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
