import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as glob from "@actions/glob";

const GLOB_PATTERN = /[*?[]/;

/**
 * Split an action input into whitespace-delimited tokens.
 *
 * The action has historically documented both `args` and `src` as plain
 * whitespace-delimited inputs. Keep that behavior instead of invoking a shell.
 */
export function splitInput(input: string): string[] {
  return input.trim().split(/\s+/).filter(Boolean);
}

/**
 * Expand glob patterns from the `src` input in a cross-platform way.
 *
 * Shell expansion is not portable across GitHub runners (notably Windows), so
 * we expand globs with @actions/glob and pass the result to Ruff as argv entries.
 * Unmatched patterns are preserved, matching the default behavior of POSIX
 * shells and allowing Ruff to report the missing path.
 */
export async function expandSourceInput(srcInput: string): Promise<string[]> {
  const sources = splitInput(srcInput);

  if (sources.length === 0) {
    return [];
  }

  const expandedSources: string[] = [];
  for (const source of sources) {
    if (!hasGlobPattern(source) || (await pathExists(source))) {
      expandedSources.push(source);
      continue;
    }

    const matches = await globMatches(source);
    expandedSources.push(...(matches.length > 0 ? matches : [source]));
  }

  return expandedSources;
}

/**
 * Resolve the starting path for version discovery from the `src` input.
 *
 * Takes the first whitespace-delimited token. Literal paths are preserved. Glob
 * patterns use their first match when available, so pyproject.toml discovery
 * starts from the project that Ruff will actually check. Unmatched globs fall
 * back to their literal prefix so Ruff can report the unmatched source later.
 */
export async function getVersionSourceDirectory(
  srcInput: string,
  versionInput: string | undefined,
  versionFileInput: string | undefined,
): Promise<string> {
  if (hasInput(versionInput) || hasInput(versionFileInput)) {
    return ".";
  }

  return await getSourceBasePath(srcInput);
}

export async function getSourceBasePath(srcInput: string): Promise<string> {
  const firstSource = splitInput(srcInput)[0] ?? ".";

  if (!hasGlobPattern(firstSource) || (await pathExists(firstSource))) {
    return stripTrailingSeparators(firstSource);
  }

  const matches = await globMatches(firstSource);
  if (matches.length > 0) {
    return matches[0] ?? ".";
  }

  return await getUnmatchedSourceBasePath(firstSource);
}

async function getUnmatchedSourceBasePath(source: string): Promise<string> {
  const sourcePath = splitSourcePath(source);
  const existingSegments = await getExistingLiteralSegments(sourcePath);
  const nextSegment = sourcePath.segments[existingSegments.length];
  if (existingSegments.length > 0 && hasGlobPattern(nextSegment ?? "")) {
    return formatSourcePath(sourcePath.root, existingSegments);
  }

  const globIndex = source.search(GLOB_PATTERN);
  const literalPrefix = source.substring(0, globIndex);
  if (literalPrefix === "") {
    return ".";
  }

  if (hasTrailingSeparator(literalPrefix)) {
    return stripTrailingSeparators(literalPrefix);
  }

  return path.dirname(literalPrefix);
}

function hasInput(input: string | undefined): boolean {
  return input !== undefined && input.trim() !== "";
}

function hasGlobPattern(source: string): boolean {
  return GLOB_PATTERN.test(source);
}

function hasTrailingSeparator(source: string): boolean {
  return /[/\\]$/.test(source);
}

function stripTrailingSeparators(source: string): string {
  return source.replace(/[/\\]+$/, "") || ".";
}

async function pathExists(source: string): Promise<boolean> {
  try {
    await fs.stat(source);
    return true;
  } catch (err) {
    if (isPathNotFoundError(err)) {
      return false;
    }

    throw err;
  }
}

function isPathNotFoundError(err: unknown): boolean {
  const code = (err as { code?: unknown }).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

async function getGlobPattern(pattern: string): Promise<string> {
  const sourcePath = splitSourcePath(pattern);
  const existingSegments = await getExistingLiteralSegments(sourcePath);

  if (existingSegments.length === 0) {
    return normalizeGlobPattern(pattern);
  }

  const escapedSegments = sourcePath.segments.map((segment, index) =>
    index < existingSegments.length ? globEscape(segment) : segment,
  );
  return normalizeGlobPattern(
    formatSourcePath(sourcePath.root, escapedSegments),
  );
}

interface SourcePath {
  root: string;
  segments: string[];
}

function splitSourcePath(source: string): SourcePath {
  const root = path.parse(source).root;
  const relativePath = source.slice(root.length);
  const separatorPattern = process.platform === "win32" ? /[/\\]+/ : /\/+/;

  return {
    root,
    segments: relativePath.split(separatorPattern).filter(Boolean),
  };
}

async function getExistingLiteralSegments(
  sourcePath: SourcePath,
): Promise<string[]> {
  const existingSegments: string[] = [];

  for (const segment of sourcePath.segments) {
    const candidateSegments = [...existingSegments, segment];
    if (
      !(await pathExists(toFileSystemPath(sourcePath.root, candidateSegments)))
    ) {
      break;
    }

    existingSegments.push(segment);
  }

  return existingSegments;
}

function toFileSystemPath(root: string, segments: string[]): string {
  if (segments.length === 0) {
    return root || ".";
  }

  return root ? path.join(root, ...segments) : path.join(...segments);
}

function formatSourcePath(root: string, segments: string[]): string {
  if (segments.length === 0) {
    return root || ".";
  }

  if (!root) {
    return segments.join("/");
  }

  const normalizedRoot = root.replace(/\\/g, "/").replace(/\/+$/, "");
  return `${normalizedRoot || "/"}/${segments.join("/")}`;
}

function globEscape(source: string): string {
  return source
    .replace(/(\[)(?=[^/]+\])/g, "[[]")
    .replace(/\?/g, "[?]")
    .replace(/\*/g, "[*]");
}

async function globMatches(pattern: string): Promise<string[]> {
  const globber = await glob.create(await getGlobPattern(pattern), {
    excludeHiddenFiles: !explicitlyTargetsHiddenPath(pattern),
    followSymbolicLinks: false,
    implicitDescendants: false,
  });
  const matches = await globber.glob();

  return await preserveSourcePathStyle(pattern, matches.sort());
}

async function preserveSourcePathStyle(
  pattern: string,
  matches: string[],
): Promise<string[]> {
  if (path.isAbsolute(pattern)) {
    return matches;
  }

  const cwd = await fs.realpath(process.cwd());
  return matches.map((match) => path.relative(cwd, match) || ".");
}

function explicitlyTargetsHiddenPath(pattern: string): boolean {
  return splitSourcePath(pattern).segments.some(isHiddenPathSegment);
}

function isHiddenPathSegment(segment: string): boolean {
  return segment.startsWith(".") && segment !== "." && segment !== "..";
}

function normalizeGlobPattern(pattern: string): string {
  if (process.platform !== "win32") {
    return pattern;
  }

  return pattern.replace(/\\/g, "/");
}
