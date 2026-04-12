import fs from "node:fs";
import * as core from "@actions/core";
import * as toml from "smol-toml";
import { normalizeVersionSpecifier } from "./specifier";
import type { ParsedVersionFile, VersionFileFormat } from "./types";

interface VersionFileParser {
  format: VersionFileFormat;
  parse(filePath: string): string | undefined;
  supports(filePath: string): boolean;
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

const VERSION_FILE_PARSERS: VersionFileParser[] = [
  {
    format: "pyproject.toml",
    parse: (filePath) => {
      const fileContent = fs.readFileSync(filePath, "utf-8");
      return getRuffVersionFromPyprojectContent(fileContent);
    },
    supports: (filePath) => filePath.endsWith("pyproject.toml"),
  },
  {
    format: "requirements",
    parse: (filePath) => {
      const fileContent = fs.readFileSync(filePath, "utf-8");
      return getRuffVersionFromRequirementsText(fileContent);
    },
    supports: (filePath) => filePath.endsWith(".txt"),
  },
];

export function getParsedVersionFile(
  filePath: string,
): ParsedVersionFile | undefined {
  core.info(`Trying to find version for ruff in: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    core.warning(`Could not find file: ${filePath}`);
    return undefined;
  }

  const parser = getVersionFileParser(filePath);
  if (parser === undefined) {
    return undefined;
  }

  try {
    const specifier = parser.parse(filePath);
    if (specifier === undefined) {
      return undefined;
    }

    const normalizedSpecifier = normalizeVersionSpecifier(specifier);
    core.info(`Found version for ruff in ${filePath}: ${normalizedSpecifier}`);
    return {
      format: parser.format,
      specifier: normalizedSpecifier,
    };
  } catch (error) {
    core.warning(
      `Error while parsing ${filePath}: ${(error as Error).message}`,
    );
    return undefined;
  }
}

export function getRuffVersionFromFile(filePath: string): string | undefined {
  return getParsedVersionFile(filePath)?.specifier;
}

export function findRuffVersionInSpec(spec: string): string | undefined {
  const trimmedSpec = spec.trim();

  if (!trimmedSpec.startsWith("ruff")) {
    return undefined;
  }

  let versionSpec = trimmedSpec.slice("ruff".length);
  if (!versionSpec.match(/^(?:\s+|[=<>~!])/)) {
    return undefined;
  }

  versionSpec = versionSpec.replace(/\\$/, "").trim();

  const match = versionSpec.match(/^([^;]+)(?:;.*)?$/);

  if (match) {
    let version = match[1].trim();
    if (version) {
      version = normalizeVersionSpecifier(version);
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

export function getRuffVersionFromRequirementsText(
  fileContent: string,
): string | undefined {
  return getRuffVersionFromAllDependencies(fileContent.split("\n"));
}

export function getRuffVersionFromPyprojectContent(
  pyprojectContent: string,
): string | undefined {
  const pyproject = parsePyprojectContent(pyprojectContent);
  return getRuffVersionFromParsedPyproject(pyproject);
}

export function parsePyprojectContent(pyprojectContent: string): Pyproject {
  return toml.parse(pyprojectContent) as Pyproject;
}

function getVersionFileParser(filePath: string): VersionFileParser | undefined {
  return VERSION_FILE_PARSERS.find((parser) => parser.supports(filePath));
}

function getRuffVersionFromParsedPyproject(
  pyproject: Pyproject,
): string | undefined {
  const dependencies: string[] = pyproject.project?.dependencies || [];
  const optionalDependencies: string[] = Object.values(
    pyproject.project?.["optional-dependencies"] || {},
  ).flat();
  const devDependencies: string[] = Object.values(
    pyproject["dependency-groups"] || {},
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
  const poetry = pyproject.tool?.poetry || {};
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

function getRuffVersionFromAllDependencies(
  allDependencies: string[],
): string | undefined {
  return allDependencies
    .map((dependency) => findRuffVersionInSpec(dependency))
    .find((version) => version !== undefined);
}
