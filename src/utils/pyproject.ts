import * as fs from "node:fs";
import * as core from "@actions/core";
import * as toml from "smol-toml";

function getRuffVersionFromAllDependencies(
  allDependencies: string[],
): string | undefined {
  const ruffVersionDefinition = allDependencies.find((dep: string) =>
    dep.startsWith("ruff"),
  );

  if (ruffVersionDefinition) {
    const match = ruffVersionDefinition.trim().match(/^ruff\s*==\s*([^\s\\]+)/);

    if (match) {
      core.info(`Found ruff version in requirements file: ${match[1]}`);
      return match[1];
    }
  }

  return undefined;
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
      if (name === "ruff" && typeof spec === "string") return spec;
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
