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
 * Glob syntax is defined by @actions/glob. This action does not emulate shell
 * expansion. Unmatched patterns are preserved so Ruff can report the missing
 * path.
 */
export async function expandSourceInput(srcInput: string): Promise<string[]> {
  const sources = splitInput(srcInput);

  if (sources.length === 0) {
    return [];
  }

  const expandedSources: string[] = [];
  for (const source of sources) {
    if (!hasGlobPattern(source)) {
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
 * patterns use their first sorted match when available, so pyproject.toml
 * discovery starts from a path Ruff will actually check. Unmatched globs fall
 * back to @actions/glob's search path.
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

  if (!hasGlobPattern(firstSource)) {
    return stripTrailingSeparators(firstSource);
  }

  const globber = await createGlobber(firstSource);
  const matches = (await globber.glob()).sort();
  if (matches.length > 0) {
    return (
      (await preserveSourcePathStyle(firstSource, [matches[0] ?? "."]))[0] ??
      "."
    );
  }

  const searchPaths = globber.getSearchPaths().sort();
  if (searchPaths.length > 0) {
    return (
      (
        await preserveSourcePathStyle(firstSource, [searchPaths[0] ?? "."])
      )[0] ?? "."
    );
  }

  return ".";
}

function hasInput(input: string | undefined): boolean {
  return input !== undefined && input.trim() !== "";
}

function hasGlobPattern(source: string): boolean {
  return GLOB_PATTERN.test(source);
}

function stripTrailingSeparators(source: string): string {
  const root = path.parse(source).root;
  const strippedSource = source.replace(/[/\\]+$/, "");

  if (root !== "" && strippedSource.length < root.length) {
    return root;
  }

  return strippedSource || root || ".";
}

async function globMatches(pattern: string): Promise<string[]> {
  const globber = await createGlobber(pattern);
  const matches = await globber.glob();

  return await preserveSourcePathStyle(pattern, matches.sort());
}

async function createGlobber(pattern: string): Promise<glob.Globber> {
  return await glob.create(normalizeGlobPattern(pattern), {
    excludeHiddenFiles: !explicitlyTargetsHiddenPath(pattern),
    followSymbolicLinks: false,
    implicitDescendants: false,
  });
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
  return splitSourcePath(pattern).some(isHiddenPathSegment);
}

function splitSourcePath(source: string): string[] {
  const root = path.parse(source).root;
  const relativePath = source.slice(root.length);
  const separatorPattern = process.platform === "win32" ? /[/\\]+/ : /\/+/;

  return relativePath.split(separatorPattern).filter(Boolean);
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
