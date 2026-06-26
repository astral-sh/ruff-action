import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";

/**
 * Search for a pyproject.toml file starting from the given source path
 * and traversing upwards through parent directories until reaching
 * the GitHub workspace root.
 *
 * If the source path points to a file, the search begins in that file's
 * parent directory.
 *
 * @param startPath The source path to start the search from (file or directory)
 * @param workspaceRoot The GitHub workspace directory (GITHUB_WORKSPACE)
 * @returns The path to the found pyproject.toml, or undefined if not found
 */
export function findPyprojectToml(
  startPath: string,
  workspaceRoot: string,
): string | undefined {
  let currentDir = resolveStartDirectory(startPath);
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

function resolveStartDirectory(startPath: string): string {
  const resolvedStartPath = path.resolve(startPath);

  if (!fs.existsSync(resolvedStartPath)) {
    return resolvedStartPath;
  }

  const stats = fs.statSync(resolvedStartPath);
  return stats.isDirectory()
    ? resolvedStartPath
    : path.dirname(resolvedStartPath);
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
