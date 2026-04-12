import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const debug = jest.fn();
const info = jest.fn();
const warning = jest.fn();

jest.unstable_mockModule("@actions/core", () => ({
  debug,
  info,
  warning,
}));

const { resolveVersionRequest } = await import(
  "../../src/version/version-request-resolver"
);

const tempDirs: string[] = [];

function createTempProject(files: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "ruff-action-version-test-"),
  );
  tempDirs.push(dir);

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe("resolveVersionRequest", () => {
  beforeEach(() => {
    debug.mockReset();
    info.mockReset();
    warning.mockReset();
  });

  it("prefers explicit input over workspace discovery", () => {
    const workspaceRoot = createTempProject({
      "pyproject.toml": `[project]\ndependencies = ["ruff==0.5.14"]\n`,
    });

    const request = resolveVersionRequest({
      sourceDirectory: workspaceRoot,
      version: "==0.6.0",
      workspaceRoot,
    });

    expect(request).toEqual({
      source: "input",
      specifier: "0.6.0",
    });
  });

  it("uses requirements.txt when it is passed via version-file", () => {
    const workspaceRoot = createTempProject({
      "requirements.txt": "ruff==0.6.17\nruff-api==0.1.0\n",
    });

    const request = resolveVersionRequest({
      sourceDirectory: workspaceRoot,
      versionFile: path.join(workspaceRoot, "requirements.txt"),
      workspaceRoot,
    });

    expect(request).toEqual({
      format: "requirements",
      source: "version-file",
      sourcePath: path.join(workspaceRoot, "requirements.txt"),
      specifier: "0.6.17",
    });
  });

  it("warns and falls back to latest when version-file does not resolve a version", () => {
    const workspaceRoot = createTempProject({
      "requirements.txt": "ruff-api==0.1.0\n",
    });

    const request = resolveVersionRequest({
      sourceDirectory: workspaceRoot,
      versionFile: path.join(workspaceRoot, "requirements.txt"),
      workspaceRoot,
    });

    expect(request).toEqual({
      source: "default",
      specifier: "latest",
    });
    expect(warning).toHaveBeenCalledWith(
      `Could not parse version from ${path.join(workspaceRoot, "requirements.txt")}. Using latest version.`,
    );
  });

  it("discovers pyproject.toml by searching upward from src", () => {
    const workspaceRoot = createTempProject({
      "pyproject.toml": `[project]\ndependencies = ["ruff==0.10.0"]\n`,
      "subproject/nested/example.py": 'print("hello")\n',
    });
    const sourceDirectory = path.join(workspaceRoot, "subproject", "nested");

    const request = resolveVersionRequest({
      sourceDirectory,
      workspaceRoot,
    });

    expect(request).toEqual({
      format: "pyproject.toml",
      source: "pyproject.toml",
      sourcePath: path.join(workspaceRoot, "pyproject.toml"),
      specifier: "0.10.0",
    });
  });

  it("falls back to latest when no workspace version source is found", () => {
    const workspaceRoot = createTempProject({
      "subproject/example.py": 'print("hello")\n',
    });

    const request = resolveVersionRequest({
      sourceDirectory: path.join(workspaceRoot, "subproject"),
      workspaceRoot,
    });

    expect(request).toEqual({
      source: "default",
      specifier: "latest",
    });
    expect(info).toHaveBeenCalledWith(
      "Could not find pyproject.toml. Using latest version.",
    );
  });

  it("throws when both version and version-file are specified", () => {
    const workspaceRoot = createTempProject();

    expect(() =>
      resolveVersionRequest({
        sourceDirectory: workspaceRoot,
        version: "0.6.0",
        versionFile: path.join(workspaceRoot, "requirements.txt"),
        workspaceRoot,
      }),
    ).toThrow("It is not allowed to specify both version and version-file");
  });
});
