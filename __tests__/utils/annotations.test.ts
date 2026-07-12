import { describe, expect, it } from "@jest/globals";
import { formatAnnotationsForSummary } from "../../src/utils/annotations";

describe("formatAnnotationsForSummary", () => {
  it("should parse a single annotation line into human-readable format", () => {
    const input =
      "::error file=src/main.py,line=10,col=5,title=Ruff (E501)::Line too long";
    const expected = "src/main.py:10:5: E501 Line too long";
    expect(formatAnnotationsForSummary(input)).toBe(expected);
  });

  it("should parse multiple annotation lines, preserving order", () => {
    const input = [
      "::error file=src/main.py,line=10,col=5,title=Ruff (E501)::Line too long",
      "::warning file=src/utils.py,line=20,col=1,title=Ruff (F401)::Unused import",
    ].join("\n");
    const expected = [
      "src/main.py:10:5: E501 Line too long",
      "src/utils.py:20:1: F401 Unused import",
    ].join("\n");
    expect(formatAnnotationsForSummary(input)).toBe(expected);
  });

  it("should parse annotation lines with different parameter order", () => {
    const input =
      "::error title=Ruff (E501),file=src/main.py,line=10,col=5::Line too long";
    const expected = "src/main.py:10:5: E501 Line too long";
    expect(formatAnnotationsForSummary(input)).toBe(expected);
  });

  it("should handle when title has no code in parentheses", () => {
    const input =
      "::error file=src/main.py,line=10,col=5,title=Ruff::Line too long";
    const expected = "src/main.py:10:5: Line too long";
    expect(formatAnnotationsForSummary(input)).toBe(expected);
  });

  it("should handle when title is missing", () => {
    const input = "::error file=src/main.py,line=10,col=5::Line too long";
    const expected = "src/main.py:10:5: Line too long";
    expect(formatAnnotationsForSummary(input)).toBe(expected);
  });

  it("should handle when file/line/col are missing", () => {
    const input = "::error title=Ruff::General failure";
    const expected = "General failure";
    expect(formatAnnotationsForSummary(input)).toBe(expected);
  });

  it("should pass through non-annotation lines unchanged", () => {
    const input =
      "Some general log output\n::error file=src/main.py,line=10,col=5,title=Ruff::Line too long\nAnother log";
    const expected =
      "Some general log output\nsrc/main.py:10:5: Line too long\nAnother log";
    expect(formatAnnotationsForSummary(input)).toBe(expected);
  });

  it("should fall back gracefully to raw input if there are unmatched commands and no matched annotations", () => {
    const input = "::some-unrelated-command param=1";
    expect(formatAnnotationsForSummary(input)).toBe(input);
  });

  it("should truncate output if it exceeds character limit", () => {
    const longLine = "a".repeat(110000);
    const result = formatAnnotationsForSummary(longLine);
    expect(result.length).toBeLessThan(110000);
    expect(result).toContain("... (truncated");
  });

  it("should handle empty or whitespace-only input", () => {
    expect(formatAnnotationsForSummary("")).toBe("");
    expect(formatAnnotationsForSummary("   \n  ")).toBe("");
  });
});
