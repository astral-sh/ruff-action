import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as exec from "@actions/exec";
import * as path from "node:path";
import { promises as fs } from "node:fs";
import type { Architecture, Platform } from "../utils/platforms";
import { validateChecksum } from "./checksum/checksum";
import { OWNER, REPO, TOOL_CACHE_NAME } from "../utils/constants";

export async function downloadLatest(
  platform: Platform,
  arch: Architecture,
  checkSum: string | undefined,
  githubToken: string | undefined,
): Promise<{ cachedToolDir: string; version: string }> {
  const artifact = `ruff-${arch}-${platform}`;
  let extension = ".tar.gz";
  if (platform === "pc-windows-msvc") {
    extension = ".zip";
  }
  const downloadUrl = `https://github.com/${OWNER}/${REPO}/releases/latest/download/${artifact}${extension}`;
  core.info(`Downloading ruff from "${downloadUrl}" ...`);

  const downloadPath = await tc.downloadTool(
    downloadUrl,
    undefined,
    githubToken,
  );
  let executablePath: string;
  let ruffDir: string;
  if (platform === "pc-windows-msvc") {
    const fullPathWithExtension = `${downloadPath}${extension}`;
    await fs.copyFile(downloadPath, fullPathWithExtension);
    ruffDir = await tc.extractZip(fullPathWithExtension);
    // On windows extracting the zip does not create an intermediate directory
    executablePath = path.join(ruffDir, "ruff.exe");
  } else {
    const extractedDir = await tc.extractTar(downloadPath);
    ruffDir = path.join(extractedDir, artifact);
    executablePath = path.join(ruffDir, "ruff");
  }
  const version = await getVersion(executablePath);
  await validateChecksum(checkSum, downloadPath, arch, platform, version);
  const cachedToolDir = await tc.cacheDir(
    ruffDir,
    TOOL_CACHE_NAME,
    version,
    arch,
  );

  return { cachedToolDir, version };
}

async function getVersion(executablePath: string): Promise<string> {
  // Parse the output of `ruff --version` to get the version
  // The output looks like
  // ruff 0.8.0

  const options: exec.ExecOptions = {
    silent: !core.isDebug(),
  };
  const execArgs = ["--version"];

  let output = "";
  options.listeners = {
    stdout: (data: Buffer) => {
      output += data.toString();
    },
  };
  await exec.exec(executablePath, execArgs, options);
  const parts = output.split(" ");
  return parts[1].trim();
}
