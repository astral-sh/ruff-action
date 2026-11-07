import { describe, expect, it } from "@jest/globals";
import { AnnotationParser } from "../../src/utils/annotations";

function formatAnnotationsForSummary(raw: string): string {
  const parser = new AnnotationParser();
  parser.append(raw);
  parser.flush();
  return parser.getSummary();
}

describe("formatAnnotationsForSummary", () => {
  it("should parse a single annotation line into human-readable format", () => {
    // Synthetic/standard workflow annotation line without message prefix duplication
    const input1 =
      "::error file=src/main.py,line=10,col=5,title=Ruff (E501)::Line too long";
    const expected1 = "src/main.py:10:5: E501 Line too long";
    expect(formatAnnotationsForSummary(input1)).toBe(expected1);

    // Verbatim ruff --output-format=github line (includes prefix duplication & endLine/endColumn)
    const input2 =
      "::error title=ruff (E501),file=src/main.py,line=10,col=5,endLine=10,endColumn=90::src/main.py:10:5: E501 Line too long";
    const expected2 = "src/main.py:10:5: E501 Line too long";
    expect(formatAnnotationsForSummary(input2)).toBe(expected2);
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

describe("AnnotationParser", () => {
  it("should process input incrementally in chunks", () => {
    const parser = new AnnotationParser();
    parser.append("::error file=src/main.py,line=10,c");
    parser.append("ol=5,title=Ruff (E501)::Line too ");
    parser.append("long\n::warning file=src/utils.py,line=2");
    parser.append("0,col=1,title=Ruff (F401)::Unused import\n");
    parser.flush();

    const expected = [
      "src/main.py:10:5: E501 Line too long",
      "src/utils.py:20:1: F401 Unused import",
    ].join("\n");
    expect(parser.getSummary()).toBe(expected);
  });

  it("should truncate and report accurate truncated character count when exceeding max limit", () => {
    const parser = new AnnotationParser();
    // Feed small lines, then a huge chunk to exceed 100k limit.
    const chunk1 = "Some initial line\n";
    const chunk2 = `${"a".repeat(110000)}\n`;
    const chunk3 = "Another line after truncation";

    parser.append(chunk1);
    parser.append(chunk2);
    parser.append(chunk3);
    parser.flush();

    const summary = parser.getSummary();
    expect(summary.length).toBeLessThan(110000);
    expect(summary).toContain("... (truncated, ");

    // Check that the suffix lists correct count
    const match = summary.match(/\(truncated, (\d+) more characters\)/);
    expect(match).not.toBeNull();
    const truncatedCount = Number(match?.[1]);
    expect(truncatedCount).toBeGreaterThan(0);
  });
});
