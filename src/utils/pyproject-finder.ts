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

    // Check if we've reached the workspace root
    if (currentDir === resolvedWorkspaceRoot) {
      // If we're at workspace root and didn't find it, stop searching
      break;
    }

    // Move up to parent directory
    const parentDir = path.dirname(currentDir);

    // If parent is the same as current, we've reached the filesystem root
    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;

    // If we've gone past the workspace root, stop searching
    if (isPathWithinWorkspace(currentDir, resolvedWorkspaceRoot) === false) {
      break;
    }
  }

  return undefined;
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
): boolean | undefined {
  try {
    const checkPathResolved = path.resolve(checkPath);
    const workspaceRootResolved = path.resolve(workspaceRoot);

    // Check if checkPath starts with workspaceRoot (case-insensitive on Windows)
    const relativePath = path.relative(
      workspaceRootResolved,
      checkPathResolved,
    );
    return !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
  } catch {
    return undefined;
  }
}
