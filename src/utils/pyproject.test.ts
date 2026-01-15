import * as core from "@actions/core";
import { findRuffVersionInSpec } from "./pyproject";

jest.mock("@actions/core", () => ({
  info: jest.fn(),
  warning: jest.fn(),
}));

describe("findRuffVersionInSpec", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("ruff dependency strings", () => {
    it("should extract version from 'ruff==0.9.3'", () => {
      const result = findRuffVersionInSpec("ruff==0.9.3");
      expect(result).toBe("0.9.3");
      expect(core.info).toHaveBeenCalledWith(
        "Found ruff version in requirements file: 0.9.3",
      );
      expect(core.warning).not.toHaveBeenCalled();
    });

    it("should extract version from 'ruff>=0.14'", () => {
      const result = findRuffVersionInSpec("ruff>=0.14");
      expect(result).toBe(">=0.14");
      expect(core.warning).not.toHaveBeenCalled();
    });

    it("should extract version from 'ruff ~=1.0.0'", () => {
      const result = findRuffVersionInSpec("ruff ~=1.0.0");
      expect(result).toBe("~=1.0.0");
      expect(core.warning).not.toHaveBeenCalled();
    });

    it("should extract version from 'ruff>=0.14,<1.0'", () => {
      const result = findRuffVersionInSpec("ruff>=0.14,<1.0");
      expect(result).toBe(">=0.14,<1.0");
      expect(core.warning).not.toHaveBeenCalled();
    });

    it("should extract version from 'ruff>=0.14,<2.0,!=1.5.0'", () => {
      const result = findRuffVersionInSpec("ruff>=0.14,<2.0,!=1.5.0");
      expect(result).toBe(">=0.14,<2.0,!=1.5.0");
      expect(core.warning).not.toHaveBeenCalled();
    });

    it("should return undefined for non-ruff dependency 'another-dep 0.1.6'", () => {
      const result = findRuffVersionInSpec("another-dep 0.1.6");
      expect(result).toBeUndefined();
      expect(core.info).not.toHaveBeenCalled();
      expect(core.warning).not.toHaveBeenCalled();
    });

    it("should return undefined for non-ruff dependency 'another-dep==0.1.6'", () => {
      const result = findRuffVersionInSpec("another-dep==0.1.6");
      expect(result).toBeUndefined();
      expect(core.info).not.toHaveBeenCalled();
      expect(core.warning).not.toHaveBeenCalled();
    });

    it("should strip trailing backslash", () => {
      const result = findRuffVersionInSpec("ruff==0.9.3 \\");
      expect(result).toBe("0.9.3");
      expect(core.info).toHaveBeenCalledWith(
        "Found ruff version in requirements file: 0.9.3",
      );
      expect(core.warning).not.toHaveBeenCalled();
    });

    it("should strip trailing backslash with whitespace", () => {
      const result = findRuffVersionInSpec("  ruff==0.9.3  \\  ");
      expect(result).toBe("0.9.3");
      expect(core.warning).not.toHaveBeenCalled();
    });
  });

  describe("environment markers", () => {
    it("should strip python_version environment marker", () => {
      const result = findRuffVersionInSpec(
        'ruff>=0.14 ; python_version >= "3.11"',
      );
      expect(result).toBe(">=0.14");
      expect(core.info).toHaveBeenCalledWith(
        "Found ruff version in requirements file: >=0.14",
      );
      expect(core.warning).toHaveBeenCalledWith(
        "Environment markers are ignored. ruff is a standalone tool that works independently of Python version.",
      );
    });

    it("should strip sys_platform environment marker", () => {
      const result = findRuffVersionInSpec(
        "ruff==0.9.3 ; sys_platform == 'linux'",
      );
      expect(result).toBe("0.9.3");
      expect(core.warning).toHaveBeenCalledWith(
        "Environment markers are ignored. ruff is a standalone tool that works independently of Python version.",
      );
    });

    it("should strip multiple environment markers", () => {
      const result = findRuffVersionInSpec(
        'ruff>=0.14 ; python_version >= "3.11" and sys_platform == "linux"',
      );
      expect(result).toBe(">=0.14");
      expect(core.warning).toHaveBeenCalledWith(
        "Environment markers are ignored. ruff is a standalone tool that works independently of Python version.",
      );
    });

    it("should handle environment markers with multiple constraints", () => {
      const result = findRuffVersionInSpec(
        'ruff>=0.14,<1.0 ; python_version >= "3.11"',
      );
      expect(result).toBe(">=0.14,<1.0");
      expect(core.warning).toHaveBeenCalledWith(
        "Environment markers are ignored. ruff is a standalone tool that works independently of Python version.",
      );
    });
  });

  describe("edge cases", () => {
    it("should handle whitespace", () => {
      const result = findRuffVersionInSpec("  ruff  >=0.14  ");
      expect(result).toBe(">=0.14");
      expect(core.warning).not.toHaveBeenCalled();
    });

    it("should handle whitespace with environment markers", () => {
      const result = findRuffVersionInSpec(
        "  ruff  >=0.14  ;  python_version >= '3.11'  ",
      );
      expect(result).toBe(">=0.14");
      expect(core.warning).toHaveBeenCalled();
    });

    it("should return undefined for empty string", () => {
      const result = findRuffVersionInSpec("");
      expect(result).toBeUndefined();
      expect(core.info).not.toHaveBeenCalled();
      expect(core.warning).not.toHaveBeenCalled();
    });

    it("should return undefined for whitespace only", () => {
      const result = findRuffVersionInSpec("   ");
      expect(result).toBeUndefined();
      expect(core.info).not.toHaveBeenCalled();
      expect(core.warning).not.toHaveBeenCalled();
    });

    it("should return undefined for just semicolon", () => {
      const result = findRuffVersionInSpec(";");
      expect(result).toBeUndefined();
      expect(core.info).not.toHaveBeenCalled();
      expect(core.warning).not.toHaveBeenCalled();
    });

    it("should handle exact example from issue #256", () => {
      const result = findRuffVersionInSpec(
        'ruff>=0.14 ; python_version >= "3.11"',
      );
      expect(result).toBe(">=0.14");
      expect(core.info).toHaveBeenCalledWith(
        "Found ruff version in requirements file: >=0.14",
      );
      expect(core.warning).toHaveBeenCalledWith(
        "Environment markers are ignored. ruff is a standalone tool that works independently of Python version.",
      );
    });

    it("should handle single-quoted environment markers", () => {
      const result = findRuffVersionInSpec(
        "ruff>=0.14 ; python_version >= '3.11'",
      );
      expect(result).toBe(">=0.14");
      expect(core.warning).toHaveBeenCalled();
    });

    it("should handle double-quoted environment markers", () => {
      const result = findRuffVersionInSpec(
        'ruff>=0.14 ; python_version >= "3.11"',
      );
      expect(result).toBe(">=0.14");
      expect(core.warning).toHaveBeenCalled();
    });
  });
});
