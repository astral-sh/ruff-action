import * as path from "node:path";
import * as core from "@actions/core";
import { findPyprojectToml } from "./pyproject-finder";

jest.mock("@actions/core", () => ({
  debug: jest.fn(),
  info: jest.fn(),
}));

describe("findPyprojectToml", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("when pyproject.toml exists in src directory", () => {
    it("should return the exact path", () => {
      const fixturesDir = path.join(
        __dirname,
        "..",
        "..",
        "__tests__",
        "fixtures",
      );
      const workspaceRoot = path.join(__dirname, "..", "..");

      const result = findPyprojectToml(fixturesDir, workspaceRoot);

      expect(result).toContain("pyproject.toml");
      expect(result).toContain("fixtures");
      expect(core.info).toHaveBeenCalled();
    });
  });

  describe("when pyproject.toml exists only in parent directory", () => {
    it("should search upwards and find the parent's pyproject.toml", () => {
      // subproject doesn't have a pyproject.toml, but its parent (parent-config-project) does
      const subprojectDir = path.join(
        __dirname,
        "..",
        "..",
        "__tests__",
        "fixtures",
        "parent-config-project",
        "subproject",
      );
      const workspaceRoot = path.join(__dirname, "..", "..");

      const result = findPyprojectToml(subprojectDir, workspaceRoot);

      expect(result).toBeTruthy();
      expect(result).toContain("pyproject.toml");
      expect(result).toContain("parent-config-project");
      expect(core.info).toHaveBeenCalled();
    });
  });

  describe("boundary conditions", () => {
    it("should stop searching at workspace root and return undefined when not found", () => {
      // Create a path that won't have pyproject.toml above it
      const nodeModulesDir = path.join(
        __dirname,
        "..",
        "..",
        "node_modules",
        "@actions",
      );
      const workspaceRoot = path.join(__dirname, "..", "..");

      const result = findPyprojectToml(nodeModulesDir, workspaceRoot);

      // Should return undefined since there's no pyproject.toml in the search path
      expect(result).toBeUndefined();
      expect(core.info).not.toHaveBeenCalledWith(
        expect.stringContaining("Found pyproject.toml"),
      );
    });

    it("should find pyproject.toml when it exists at workspace root", () => {
      // Use parent-config-project as the "workspace root" for this test
      // Start from subproject (which has no pyproject.toml) to search up to workspace root
      const subprojectDir = path.join(
        __dirname,
        "..",
        "..",
        "__tests__",
        "fixtures",
        "parent-config-project",
        "subproject",
      );
      const workspaceRoot = path.join(
        __dirname,
        "..",
        "..",
        "__tests__",
        "fixtures",
        "parent-config-project",
      );

      const result = findPyprojectToml(subprojectDir, workspaceRoot);

      expect(result).toBeTruthy();
      expect(result).toContain("pyproject.toml");
      expect(result).toContain("parent-config-project");
    });

    it("should stop at workspace root even if searching from it", () => {
      const workspaceRoot = path.join(
        __dirname,
        "..",
        "..",
        "__tests__",
        "fixtures",
      );

      const result = findPyprojectToml(workspaceRoot, workspaceRoot);

      // Should find pyproject.toml at workspace root
      expect(result).toBeTruthy();
      expect(result).toContain("pyproject.toml");
      expect(result).toContain("fixtures");
    });
  });

  describe("edge cases", () => {
    it("should handle relative paths", () => {
      const srcDir = "./__tests__/fixtures";
      const workspaceRoot = ".";

      const result = findPyprojectToml(srcDir, workspaceRoot);

      // Should work with relative paths
      expect(result).toBeTruthy();
      expect(result).toContain("pyproject.toml");
    });

    it("should handle when src equals workspace root", () => {
      const workspaceRoot = path.join(
        __dirname,
        "..",
        "..",
        "__tests__",
        "fixtures",
      );
      const result = findPyprojectToml(workspaceRoot, workspaceRoot);

      expect(result).toBeTruthy();
      expect(result).toContain("pyproject.toml");
      expect(result).toContain("fixtures");
    });

    it("should log debug messages for each checked path", () => {
      const pythonProjectDir = path.join(
        __dirname,
        "..",
        "..",
        "__tests__",
        "fixtures",
        "python-project",
      );
      const workspaceRoot = path.join(__dirname, "..", "..");

      findPyprojectToml(pythonProjectDir, workspaceRoot);

      expect(core.debug).toHaveBeenCalled();
      const debugCalls = (core.debug as jest.Mock).mock.calls;
      expect(debugCalls.length).toBeGreaterThan(0);

      // First debug call should be for the starting directory
      expect(debugCalls[0][0]).toContain("Checking for");
      expect(debugCalls[0][0]).toContain("python-project");
    });

    it("should handle paths with trailing slashes", () => {
      const fixturesDir = `${path.join(__dirname, "..", "..", "__tests__", "fixtures")}/`;
      const workspaceRoot = path.join(__dirname, "..", "..");

      const result = findPyprojectToml(fixturesDir, workspaceRoot);

      expect(result).toBeTruthy();
      expect(result).toContain("pyproject.toml");
    });
  });
});
