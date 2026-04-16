import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

jest.unstable_mockModule("@actions/core", () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
}));

const { tokenize, expandGlobs } = await import("../../src/utils/glob");

describe("tokenize", () => {
  it("should split on whitespace", () => {
    expect(tokenize("foo bar baz")).toEqual(["foo", "bar", "baz"]);
  });

  it("should handle single token", () => {
    expect(tokenize("foo")).toEqual(["foo"]);
  });

  it("should handle empty string", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("should handle multiple spaces between tokens", () => {
    expect(tokenize("foo   bar")).toEqual(["foo", "bar"]);
  });

  it("should handle tabs as whitespace", () => {
    expect(tokenize("foo\tbar")).toEqual(["foo", "bar"]);
  });

  it("should handle newlines as whitespace", () => {
    expect(tokenize("foo\nbar\rbaz\r\nqux")).toEqual([
      "foo",
      "bar",
      "baz",
      "qux",
    ]);
  });

  it("should preserve double-quoted strings", () => {
    expect(tokenize('"my project/*.py"')).toEqual(["my project/*.py"]);
  });

  it("should preserve single-quoted strings", () => {
    expect(tokenize("'my project/*.py'")).toEqual(["my project/*.py"]);
  });

  it("should handle mixed quoted and unquoted tokens", () => {
    expect(tokenize('"my project" tests')).toEqual(["my project", "tests"]);
  });

  it('should unescape \\" and \\\\ inside double quotes', () => {
    expect(tokenize('"hello\\"world"')).toEqual(['hello"world']);
    expect(tokenize('"hello\\\\world"')).toEqual(["hello\\world"]);
  });

  it("should preserve other backslashes inside double quotes", () => {
    // \x is not a recognized escape, so both characters are kept
    expect(tokenize('"hello\\xworld"')).toEqual(["hello\\xworld"]);
  });

  it("should not apply backslash escaping inside single quotes", () => {
    // Inside single quotes, backslash is literal — no escaping
    expect(tokenize("'hello\\world'")).toEqual(["hello\\world"]);
  });

  it("should handle glob patterns", () => {
    expect(tokenize("foo/bar/*.py")).toEqual(["foo/bar/*.py"]);
  });

  it("should handle multiple glob patterns", () => {
    expect(tokenize("foo/*.py bar/*.py")).toEqual(["foo/*.py", "bar/*.py"]);
  });
});

describe("expandGlobs", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ruff-action-glob-test-"));

    // Create test file structure:
    // tmpDir/
    //   file1.py
    //   file2.py
    //   sub/
    //     file3.py
    //     file4.txt
    fs.writeFileSync(path.join(tmpDir, "file1.py"), "print('hello')");
    fs.writeFileSync(path.join(tmpDir, "file2.py"), "print('world')");
    fs.mkdirSync(path.join(tmpDir, "sub"));
    fs.writeFileSync(path.join(tmpDir, "sub", "file3.py"), "print('sub')");
    fs.writeFileSync(path.join(tmpDir, "sub", "file4.txt"), "text");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { force: true, recursive: true });
  });

  it("should expand a glob pattern to matching files", async () => {
    const result = await expandGlobs(path.join(tmpDir, "*.py"));

    expect(result).toHaveLength(2);
    expect(result.map((f) => path.basename(f))).toEqual(
      expect.arrayContaining(["file1.py", "file2.py"]),
    );
  });

  it("should pass through a plain directory path", async () => {
    const result = await expandGlobs(tmpDir);

    expect(result).toEqual([tmpDir]);
  });

  it("should pass through a plain file path", async () => {
    const filePath = path.join(tmpDir, "file1.py");
    const result = await expandGlobs(filePath);

    expect(result).toEqual([filePath]);
  });

  it("should handle multiple patterns", async () => {
    const result = await expandGlobs(
      `${path.join(tmpDir, "*.py")} ${path.join(tmpDir, "sub", "*.txt")}`,
    );

    expect(result).toHaveLength(3);
    expect(result.map((f) => path.basename(f))).toEqual(
      expect.arrayContaining(["file1.py", "file2.py", "file4.txt"]),
    );
  });

  it("should throw when a glob pattern matches no files", async () => {
    await expect(
      expandGlobs(path.join(tmpDir, "nonexistent/*.py")),
    ).rejects.toThrow("matched no files");
  });

  it("should throw when a plain path does not exist", async () => {
    await expect(
      expandGlobs(path.join(tmpDir, "does_not_exist.py")),
    ).rejects.toThrow("does not exist");
  });

  it("should handle globstar ** patterns", async () => {
    const result = await expandGlobs(path.join(tmpDir, "**", "*.py"));

    expect(result).toHaveLength(3);
    expect(result.map((f) => path.basename(f))).toEqual(
      expect.arrayContaining(["file1.py", "file2.py", "file3.py"]),
    );
  });

  it("should handle empty input", async () => {
    const result = await expandGlobs("");

    expect(result).toEqual([]);
  });

  it("should handle quoted paths with spaces", async () => {
    // Create a directory with a space
    const spaceDir = path.join(tmpDir, "my project");
    fs.mkdirSync(spaceDir);
    fs.writeFileSync(path.join(spaceDir, "main.py"), "print('hello')");

    const result = await expandGlobs(`"${path.join(spaceDir, "*.py")}"`);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(path.join(spaceDir, "main.py"));
  });
});
