import * as fs from "node:fs";
import * as core from "@actions/core";
import * as toml from "@iarna/toml";

export function getRuffVersionFromPyproject(
  filePath: string,
): string | undefined {
  const pyprojectContent = fs.readFileSync(filePath, "utf-8");
  const pyproject = toml.parse(pyprojectContent) as {
    project?: { dependencies?: string[] };
    "dependency-groups"?: { dev?: string[] };
  };

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
