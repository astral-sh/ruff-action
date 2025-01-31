import * as fs from "node:fs";
import * as core from "@actions/core";
import * as toml from "smol-toml";

export function getRuffVersionFromPyproject(
  filePath: string,
): string | undefined {
  if (!fs.existsSync(filePath)) {
    core.warning(`Could not find file: ${filePath}`);
    return undefined;
  }
  const pyprojectContent = fs.readFileSync(filePath, "utf-8");
  let pyproject:
    | {
        project?: {
          dependencies?: string[];
          "optional-dependencies"?: Map<string, string[]>;
        };
        "dependency-groups"?: Map<string, Array<string | object>>;
      }
    | undefined;
  try {
    pyproject = toml.parse(pyprojectContent);
  } catch (err) {
    const message = (err as Error).message;
    core.warning(`Error while parsing ${filePath}: ${message}`);
    return undefined;
  }

  const dependencies: string[] = pyproject?.project?.dependencies || [];
  const optionalDependencies: string[] = Object.values(
    pyproject?.project?.["optional-dependencies"] || {},
  ).flat();
  const devDependencies: string[] = Object.values(
    pyproject?.["dependency-groups"] || {},
  )
    .flat()
    .filter((item: string | object) => typeof item === "string");
  const allDependencies: string[] = dependencies.concat(
    optionalDependencies,
    devDependencies,
  );

  const ruffVersionDefinition = allDependencies.find((dep: string) =>
    dep.startsWith("ruff"),
  );

  if (ruffVersionDefinition) {
    const ruffVersion = ruffVersionDefinition
      .match(/^ruff([^A-Z0-9._-]+.*)$/)?.[1]
      .trim();
    if (ruffVersion?.startsWith("==")) {
      return ruffVersion.slice(2);
    }
    core.info(`Found ruff version in pyproject.toml: ${ruffVersion}`);
    return ruffVersion;
  }

  return undefined;
}
