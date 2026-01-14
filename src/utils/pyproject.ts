import * as fs from "node:fs";
import * as core from "@actions/core";
import * as toml from "smol-toml";

/**
 * Find ruff version in a dependency specification.
 * Only handles strings that start with "ruff" (e.g., "ruff==0.9.3").
 * Returns undefined for non-ruff dependencies.
 * Strips environment markers (everything after ';').
 * Strips leading '==' from exact version specifiers (PEP 440) for downstream compatibility.
 *
 * @internal This is exported for testing purposes only.
 */
export function findRuffVersionInSpec(spec: string): string | undefined {
  const trimmedSpec = spec.trim();

  const fullDepMatch = trimmedSpec.match(/^ruff\s*(.+)$/);
  let versionSpec: string;
  if (fullDepMatch) {
    versionSpec = fullDepMatch[1];
  } else {
    return undefined;
  }

  // Strip trailing backslash (line continuation)
  versionSpec = versionSpec.replace(/\\$/, "").trim();

  // Strip environment markers (everything after ';')
  const match = versionSpec.match(/^([^;]+)(?:;.*)?$/);

  if (match) {
    let version = match[1].trim();
    if (version) {
      // Strip leading '==' from exact version specifiers for compatibility with semver
      if (version.startsWith("==")) {
        version = version.slice(2);
      }
      if (trimmedSpec.includes(";")) {
        core.warning(
          "Environment markers are ignored. ruff is a standalone tool that works independently of Python version.",
        );
      }
      core.info(`Found ruff version in requirements file: ${version}`);
      return version;
    }
  }

  return undefined;
}

function getRuffVersionFromAllDependencies(
  allDependencies: string[],
): string | undefined {
  return allDependencies
    .map((dep) => findRuffVersionInSpec(dep))
    .find((version) => version !== undefined);
}

interface Pyproject {
  project?: {
    dependencies?: string[];
    "optional-dependencies"?: Record<string, string[]>;
  };
  "dependency-groups"?: Record<string, Array<string | object>>;
  tool?: {
    poetry?: {
      dependencies?: Record<string, string | object>;
      group?: Record<string, { dependencies: Record<string, string | object> }>;
    };
  };
}

function parsePyproject(pyprojectContent: string): string | undefined {
  const pyproject: Pyproject = toml.parse(pyprojectContent);
  const dependencies: string[] = pyproject?.project?.dependencies || [];
  const optionalDependencies: string[] = Object.values(
    pyproject?.project?.["optional-dependencies"] || {},
  ).flat();
  const devDependencies: string[] = Object.values(
    pyproject?.["dependency-groups"] || {},
  )
    .flat()
    .filter((item: string | object) => typeof item === "string");
  return (
    getRuffVersionFromAllDependencies(
      dependencies.concat(optionalDependencies, devDependencies),
    ) || getRuffVersionFromPoetryGroups(pyproject)
  );
}

function getRuffVersionFromPoetryGroups(
  pyproject: Pyproject,
): string | undefined {
  // Special handling for Poetry until it supports PEP 735
  // See: <https://github.com/python-poetry/poetry/issues/9751>
  const poetry = pyproject?.tool?.poetry || {};
  const poetryGroups = Object.values(poetry.group || {});
  if (poetry.dependencies) {
    poetryGroups.unshift({ dependencies: poetry.dependencies });
  }
  return poetryGroups
    .flatMap((group) => Object.entries(group.dependencies))
    .map(([name, spec]) => {
      if (typeof spec === "string") {
        return findRuffVersionInSpec(`${name} ${spec}`);
      }
      return undefined;
    })
    .find((version) => version !== undefined);
}

export function getRuffVersionFromRequirementsFile(
  filePath: string,
): string | undefined {
  if (!fs.existsSync(filePath)) {
    core.warning(`Could not find file: ${filePath}`);
    return undefined;
  }
  const pyprojectContent = fs.readFileSync(filePath, "utf-8");
  if (filePath.endsWith(".txt")) {
    return getRuffVersionFromAllDependencies(pyprojectContent.split("\n"));
  }
  try {
    return parsePyproject(pyprojectContent);
  } catch (err) {
    const message = (err as Error).message;
    core.warning(`Error while parsing ${filePath}: ${message}`);
    return undefined;
  }
}
