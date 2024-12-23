import * as core from "@actions/core";

export const version = core.getInput("version");
export const checkSum = core.getInput("checksum");
export const githubToken = core.getInput("github-token");
export const args = core.getInput("args");
export const src = core.getInput("src");
export const versionFile = core.getInput("version-file");
