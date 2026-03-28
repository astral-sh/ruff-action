import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const debug = jest.fn();
const info = jest.fn();

jest.unstable_mockModule("@actions/core", () => ({
  debug,
  info,
}));

const { findPyprojectToml } = await import("../../src/utils/pyproject-finder");

const testFilePath = fileURLToPath(import.meta.url);
const testDir = path.dirname(testFilePath);
const repoRoot = path.resolve(testDir, "..", "..");
const fixturesDir = path.join(repoRoot, "__tests__", "fixtures");

describe("findPyprojectToml", () => {
  beforeEach(() => {
    debug.mockReset();
    info.mockReset();
  });

  describe("when pyproject.toml exists in src directory", () => {
    it("should return the exact path", () => {
      const result = findPyprojectToml(fixturesDir, repoRoot);

      expect(result).toContain("pyproject.toml");
      expect(result).toContain("fixtures");
      expect(info).toHaveBeenCalled();
    });
  });

  describe("when pyproject.toml exists only in parent directory", () => {
    it("should search upwards and find the parent's pyproject.toml", () => {
      const subprojectDir = path.join(
        fixturesDir,
        "parent-config-project",
        "subproject",
      );

      const result = findPyprojectToml(subprojectDir, repoRoot);

      expect(result).toBeTruthy();
      expect(result).toContain("pyproject.toml");
      expect(result).toContain("parent-config-project");
      expect(info).toHaveBeenCalled();
    });
  });

  describe("boundary conditions", () => {
    it("should stop searching at workspace root and return undefined when not found", () => {
      const nodeModulesDir = path.join(repoRoot, "node_modules", "@actions");

      const result = findPyprojectToml(nodeModulesDir, repoRoot);

      expect(result).toBeUndefined();
      expect(info).not.toHaveBeenCalledWith(
        expect.stringContaining("Found pyproject.toml"),
      );
    });

    it("should find pyproject.toml when it exists at workspace root", () => {
      const parentConfigProjectDir = path.join(
        fixturesDir,
        "parent-config-project",
      );
      const subprojectDir = path.join(parentConfigProjectDir, "subproject");

      const result = findPyprojectToml(subprojectDir, parentConfigProjectDir);

      expect(result).toBeTruthy();
      expect(result).toContain("pyproject.toml");
      expect(result).toContain("parent-config-project");
    });

    it("should stop at workspace root even if searching from it", () => {
      const result = findPyprojectToml(fixturesDir, fixturesDir);

      expect(result).toBeTruthy();
      expect(result).toContain("pyproject.toml");
      expect(result).toContain("fixtures");
    });
  });

  describe("edge cases", () => {
    it("should handle relative paths", () => {
      const result = findPyprojectToml("./__tests__/fixtures", ".");

      expect(result).toBeTruthy();
      expect(result).toContain("pyproject.toml");
    });

    it("should handle when src equals workspace root", () => {
      const result = findPyprojectToml(fixturesDir, fixturesDir);

      expect(result).toBeTruthy();
      expect(result).toContain("pyproject.toml");
      expect(result).toContain("fixtures");
    });

    it("should log debug messages for each checked path", () => {
      const pythonProjectDir = path.join(fixturesDir, "python-project");

      findPyprojectToml(pythonProjectDir, repoRoot);

      expect(debug).toHaveBeenCalled();
      expect(debug.mock.calls.length).toBeGreaterThan(0);
      expect(debug.mock.calls[0][0]).toContain("Checking for");
      expect(debug.mock.calls[0][0]).toContain("python-project");
    });

    it("should handle paths with trailing slashes", () => {
      const result = findPyprojectToml(`${fixturesDir}/`, repoRoot);

      expect(result).toBeTruthy();
      expect(result).toContain("pyproject.toml");
    });
  });
});
