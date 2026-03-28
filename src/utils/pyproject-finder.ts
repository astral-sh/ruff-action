import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";

/**
 * Search for a pyproject.toml file starting from the given directory
 * and traversing upwards through parent directories until reaching
 * the GitHub workspace root.
 *
 * @param startDir The directory to start the search from (e.g., the src input)
 * @param workspaceRoot The GitHub workspace directory (GITHUB_WORKSPACE)
 * @returns The path to the found pyproject.toml, or undefined if not found
 */
export function findPyprojectToml(
  startDir: string,
  workspaceRoot: string,
): string | undefined {
  let currentDir = path.resolve(startDir);
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);

  while (true) {
    const pyprojectPath = path.join(currentDir, "pyproject.toml");
    core.debug(`Checking for ${pyprojectPath}`);

    if (fs.existsSync(pyprojectPath)) {
      core.info(`Found pyproject.toml at ${pyprojectPath}`);
      return pyprojectPath;
    }
    if (currentDir === resolvedWorkspaceRoot) {
      return undefined;
    }

    const parentDir = path.dirname(currentDir);
    if (
      parentDir === currentDir ||
      !isPathWithinWorkspace(parentDir, resolvedWorkspaceRoot)
    ) {
      return undefined;
    }

    currentDir = parentDir;
  }
}

/**
 * Check if a given path is within or equal to the workspace root.
 *
 * @param checkPath The path to check
 * @param workspaceRoot The workspace root directory
 * @returns true if within or equal to workspace, false if outside, undefined if can't determine
 */
function isPathWithinWorkspace(
  checkPath: string,
  workspaceRoot: string,
): boolean {
  const relativePath = path.relative(workspaceRoot, checkPath);
  return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}
