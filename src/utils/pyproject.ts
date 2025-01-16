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
        project?: { dependencies?: string[] };
        "dependency-groups"?: { dev?: string[] };
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
  const devDependencies: string[] = pyproject?.["dependency-groups"]?.dev || [];

  const ruffVersionDefinition =
    dependencies.find((dep: string) => dep.startsWith("ruff")) ||
    devDependencies.find((dep: string) => dep.startsWith("ruff"));

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
