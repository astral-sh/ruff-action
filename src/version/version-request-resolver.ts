import * as core from "@actions/core";
import { findPyprojectToml } from "../utils/pyproject-finder";
import { getParsedVersionFile } from "./file-parser";
import { normalizeVersionSpecifier } from "./specifier";
import type {
  ParsedVersionFile,
  ResolveRuffVersionOptions,
  VersionRequest,
} from "./types";

export interface VersionRequestResolver {
  resolve(context: VersionRequestContext): VersionRequest | undefined;
}

export class VersionRequestContext {
  readonly sourceDirectory: string;
  readonly version: string | undefined;
  readonly versionFile: string | undefined;
  readonly workspaceRoot: string;

  private readonly parsedFiles = new Map<
    string,
    ParsedVersionFile | undefined
  >();

  constructor(
    version: string | undefined,
    versionFile: string | undefined,
    sourceDirectory: string,
    workspaceRoot: string,
  ) {
    this.version = version;
    this.versionFile = versionFile;
    this.sourceDirectory = sourceDirectory;
    this.workspaceRoot = workspaceRoot;
  }

  getVersionFile(filePath: string): ParsedVersionFile | undefined {
    const cachedResult = this.parsedFiles.get(filePath);
    if (cachedResult !== undefined || this.parsedFiles.has(filePath)) {
      return cachedResult;
    }

    const result = getParsedVersionFile(filePath);
    this.parsedFiles.set(filePath, result);
    return result;
  }

  getWorkspacePyprojectPath(): string | undefined {
    return findPyprojectToml(this.sourceDirectory, this.workspaceRoot);
  }
}

export class ExplicitInputVersionResolver implements VersionRequestResolver {
  resolve(context: VersionRequestContext): VersionRequest | undefined {
    if (context.version === undefined) {
      return undefined;
    }

    return {
      source: "input",
      specifier: normalizeVersionSpecifier(context.version),
    };
  }
}

export class VersionFileVersionResolver implements VersionRequestResolver {
  resolve(context: VersionRequestContext): VersionRequest | undefined {
    if (context.versionFile === undefined) {
      return undefined;
    }

    const versionFile = context.getVersionFile(context.versionFile);
    if (versionFile === undefined) {
      core.warning(
        `Could not parse version from ${context.versionFile}. Using latest version.`,
      );
      return undefined;
    }

    return {
      format: versionFile.format,
      source: "version-file",
      sourcePath: context.versionFile,
      specifier: versionFile.specifier,
    };
  }
}

export class WorkspaceVersionResolver implements VersionRequestResolver {
  resolve(context: VersionRequestContext): VersionRequest | undefined {
    const pyprojectPath = context.getWorkspacePyprojectPath();
    if (!pyprojectPath) {
      core.info("Could not find pyproject.toml. Using latest version.");
      return undefined;
    }

    const versionFile = context.getVersionFile(pyprojectPath);
    if (versionFile === undefined) {
      core.info(
        `Could not parse version from ${pyprojectPath}. Using latest version.`,
      );
      return undefined;
    }

    return {
      format: versionFile.format,
      source: "pyproject.toml",
      sourcePath: pyprojectPath,
      specifier: versionFile.specifier,
    };
  }
}

export class LatestVersionResolver implements VersionRequestResolver {
  resolve(): VersionRequest {
    return {
      source: "default",
      specifier: "latest",
    };
  }
}

const VERSION_REQUEST_RESOLVERS: VersionRequestResolver[] = [
  new ExplicitInputVersionResolver(),
  new VersionFileVersionResolver(),
  new WorkspaceVersionResolver(),
  new LatestVersionResolver(),
];

export function resolveVersionRequest(
  options: ResolveRuffVersionOptions,
): VersionRequest {
  const version = emptyToUndefined(options.version);
  const versionFile = emptyToUndefined(options.versionFile);

  if (version !== undefined && versionFile !== undefined) {
    throw new Error(
      "It is not allowed to specify both version and version-file",
    );
  }

  const context = new VersionRequestContext(
    version,
    versionFile,
    options.sourceDirectory,
    options.workspaceRoot,
  );

  for (const resolver of VERSION_REQUEST_RESOLVERS) {
    const request = resolver.resolve(context);
    if (request !== undefined) {
      return request;
    }
  }

  throw new Error("Could not resolve a requested Ruff version.");
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}
