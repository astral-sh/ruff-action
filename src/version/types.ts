export type VersionSource =
  | "input"
  | "version-file"
  | "pyproject.toml"
  | "default";

export type VersionFileFormat = "pyproject.toml" | "requirements";

export interface ParsedVersionFile {
  format: VersionFileFormat;
  specifier: string;
}

export interface ResolveRuffVersionOptions {
  manifestFile?: string;
  sourceDirectory: string;
  version?: string;
  versionFile?: string;
  workspaceRoot: string;
}

export interface VersionRequest {
  format?: VersionFileFormat;
  source: VersionSource;
  sourcePath?: string;
  specifier: string;
}
