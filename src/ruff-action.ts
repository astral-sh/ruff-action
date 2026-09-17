import * as path from "node:path";
import { StringDecoder } from "node:string_decoder";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as semver from "semver";
import {
  downloadVersion,
  tryGetFromToolCache,
} from "./download/download-version";
import { AnnotationParser } from "./utils/annotations";
import {
  args,
  checkSum,
  downloadFromAstralMirror,
  githubToken,
  manifestFile,
  src,
  summary,
  version,
  versionFile as versionFileInput,
} from "./utils/inputs";
import {
  type Architecture,
  getArch,
  getPlatform,
  type Platform,
} from "./utils/platforms";
import {
  expandSourceInput,
  getVersionSourceDirectory,
  splitInput,
} from "./utils/source-input";
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
    const setupResult = await setupRuff(
      platform,
      arch,
      checkSum,
      githubToken,
      downloadFromAstralMirror,
    );

    addRuffToPath(setupResult.ruffDir);
    setOutputFormat();
    addMatchers();
    core.setOutput("ruff-version", setupResult.version);
    core.info(`Successfully installed ruff version ${setupResult.version}`);

    const { exitCode, summaryText } = await runRuff(
      path.join(setupResult.ruffDir, "ruff"),
      args,
      src,
    );

    if (summary) {
      const sanitizedSummaryText = summaryText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      await core.summary
        .addHeading("Ruff Output")
        .addCodeBlock(sanitizedSummaryText || "No issues found.", "text")
        .write();
    }

    if (exitCode !== 0) {
      core.setFailed(`Ruff failed with exit code ${exitCode}`);
    }
    process.exit(exitCode);
  } catch (err) {
    core.setFailed((err as Error).message);
  }
}

async function setupRuff(
  platform: Platform,
  arch: Architecture,
  checkSum: string | undefined,
  githubToken: string,
  downloadFromAstralMirror: boolean,
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
    downloadFromAstralMirror,
  );

  return {
    ruffDir: downloadVersionResult.cachedToolDir,
    version: downloadVersionResult.version,
  };
}

async function determineVersion(): Promise<string> {
  return await resolveRuffVersion({
    manifestFile: manifestFile || undefined,
    sourceDirectory: await getVersionSourceDirectory(
      src,
      version,
      versionFileInput,
    ),
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
  args: string,
  src: string,
): Promise<{ exitCode: number; summaryText: string }> {
  const execArgs = [...splitInput(args), ...(await expandSourceInput(src))];
  const parser = summary ? new AnnotationParser() : undefined;
  const stdoutDecoder = new StringDecoder("utf8");
  const stderrDecoder = new StringDecoder("utf8");
  const options: exec.ExecOptions = {
    ignoreReturnCode: true,
    listeners: {
      stderr: (data: Buffer) => {
        parser?.append(stderrDecoder.write(data));
      },
      stdout: (data: Buffer) => {
        parser?.append(stdoutDecoder.write(data));
      },
    },
  };
  const exitCode = await exec.exec(ruffExecutablePath, execArgs, options);
  if (parser) {
    parser.append(stdoutDecoder.end());
    parser.append(stderrDecoder.end());
    parser.flush();
  }
  return { exitCode, summaryText: parser?.getSummary() ?? "" };
}

run();
