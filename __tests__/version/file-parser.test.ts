import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const info = jest.fn();
const warning = jest.fn();

jest.unstable_mockModule("@actions/core", () => ({
  debug: jest.fn(),
  info,
  warning,
}));

const { findRuffVersionInSpec, getRuffVersionFromFile } = await import(
  "../../src/version/file-parser"
);

describe("file-parser", () => {
  beforeEach(() => {
    info.mockReset();
    warning.mockReset();
  });

  describe("findRuffVersionInSpec", () => {
    it("extracts version from 'ruff==0.9.3'", () => {
      const result = findRuffVersionInSpec("ruff==0.9.3");
      expect(result).toBe("0.9.3");
      expect(info).toHaveBeenCalledWith(
        "Found ruff version in requirements file: 0.9.3",
      );
      expect(warning).not.toHaveBeenCalled();
    });

    it("extracts version from 'ruff>=0.14'", () => {
      const result = findRuffVersionInSpec("ruff>=0.14");
      expect(result).toBe(">=0.14");
      expect(warning).not.toHaveBeenCalled();
    });

    it("extracts version from 'ruff ~=1.0.0'", () => {
      const result = findRuffVersionInSpec("ruff ~=1.0.0");
      expect(result).toBe("~=1.0.0");
      expect(warning).not.toHaveBeenCalled();
    });

    it("extracts version from 'ruff>=0.14,<1.0'", () => {
      const result = findRuffVersionInSpec("ruff>=0.14,<1.0");
      expect(result).toBe(">=0.14,<1.0");
      expect(warning).not.toHaveBeenCalled();
    });

    it("extracts version from 'ruff>=0.14,<2.0,!=1.5.0'", () => {
      const result = findRuffVersionInSpec("ruff>=0.14,<2.0,!=1.5.0");
      expect(result).toBe(">=0.14,<2.0,!=1.5.0");
      expect(warning).not.toHaveBeenCalled();
    });

    it("returns undefined for non-ruff dependencies", () => {
      const result = findRuffVersionInSpec("another-dep==0.1.6");
      expect(result).toBeUndefined();
      expect(info).not.toHaveBeenCalled();
      expect(warning).not.toHaveBeenCalled();
    });

    it("strips trailing backslash", () => {
      const result = findRuffVersionInSpec("ruff==0.9.3 \\");
      expect(result).toBe("0.9.3");
      expect(info).toHaveBeenCalledWith(
        "Found ruff version in requirements file: 0.9.3",
      );
      expect(warning).not.toHaveBeenCalled();
    });

    it("strips environment markers and warns", () => {
      const result = findRuffVersionInSpec(
        'ruff>=0.14 ; python_version >= "3.11"',
      );
      expect(result).toBe(">=0.14");
      expect(info).toHaveBeenCalledWith(
        "Found ruff version in requirements file: >=0.14",
      );
      expect(warning).toHaveBeenCalledWith(
        "Environment markers are ignored. ruff is a standalone tool that works independently of Python version.",
      );
    });

    it("handles whitespace", () => {
      const result = findRuffVersionInSpec("  ruff  >=0.14  ");
      expect(result).toBe(">=0.14");
      expect(warning).not.toHaveBeenCalled();
    });

    it("returns undefined for empty strings", () => {
      const result = findRuffVersionInSpec("");
      expect(result).toBeUndefined();
      expect(info).not.toHaveBeenCalled();
      expect(warning).not.toHaveBeenCalled();
    });
  });

  describe("getRuffVersionFromFile", () => {
    it("reads the version from requirements.txt", () => {
      const result = getRuffVersionFromFile(
        "__tests__/fixtures/requirements.txt",
      );
      expect(result).toBe("0.9.0");
    });

    it("reads the version from requirements files with hashes", () => {
      const result = getRuffVersionFromFile(
        "__tests__/fixtures/requirements-with-hash.txt",
      );
      expect(result).toBe("0.9.0");
    });

    it("reads the version from pyproject.toml dependencies", () => {
      const result = getRuffVersionFromFile(
        "__tests__/fixtures/pyproject.toml",
      );
      expect(result).toBe("0.9.3");
    });

    it("reads the version from Poetry dependencies", () => {
      const result = getRuffVersionFromFile(
        "__tests__/fixtures/pyproject-dependency-poetry-project/pyproject.toml",
      );
      expect(result).toBe("~0.8.2");
    });
  });
});
