import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, jest } from "@jest/globals";

jest.unstable_mockModule("@actions/core", () => ({
  debug: jest.fn(),
  info: jest.fn(),
}));

const {
  expandSourceInput,
  getSourceBasePath,
  getVersionSourceDirectory,
  splitInput,
} = await import("../../src/utils/source-input");
const { findPyprojectToml } = await import("../../src/utils/pyproject-finder");

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir !== undefined) {
    await fs.rm(tempDir, { force: true, recursive: true });
    tempDir = undefined;
  }
});

async function createTempProject(): Promise<string> {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ruff-action-source-"));
  await fs.mkdir(path.join(tempDir, "src", "package", "nested"), {
    recursive: true,
  });
  await fs.writeFile(path.join(tempDir, "src", "package", "__init__.py"), "");
  await fs.writeFile(path.join(tempDir, "src", "package", "main.py"), "");
  await fs.writeFile(
    path.join(tempDir, "src", "package", "nested", "mod.py"),
    "",
  );
  await fs.writeFile(path.join(tempDir, "src", "package", "notes.txt"), "");
  await fs.mkdir(path.join(tempDir, "src", "pkg[legacy]"), {
    recursive: true,
  });
  await fs.writeFile(path.join(tempDir, "src", "pkg[legacy]", "main.py"), "");
  await fs.mkdir(path.join(tempDir, "src", "pkgl"), { recursive: true });
  await fs.writeFile(path.join(tempDir, "src", "pkgl", "main.py"), "");

  return tempDir;
}

describe("splitInput", () => {
  it("splits whitespace-delimited inputs", () => {
    expect(splitInput(" check   --fix\n--diff ")).toEqual([
      "check",
      "--fix",
      "--diff",
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(splitInput("  \n\t ")).toEqual([]);
  });
});

describe("expandSourceInput", () => {
  it("leaves non-glob sources unchanged", async () => {
    await expect(expandSourceInput("src file.py")).resolves.toEqual([
      "src",
      "file.py",
    ]);
  });

  it("expands recursive globs without relying on shell behavior", async () => {
    const projectDir = await createTempProject();
    const pattern = path.join(projectDir, "src", "**", "*.py");

    await expect(expandSourceInput(pattern)).resolves.toEqual([
      path.join(projectDir, "src", "package", "__init__.py"),
      path.join(projectDir, "src", "package", "main.py"),
      path.join(projectDir, "src", "package", "nested", "mod.py"),
      path.join(projectDir, "src", "pkg[legacy]", "main.py"),
      path.join(projectDir, "src", "pkgl", "main.py"),
    ]);
  });

  it("preserves relative source patterns as relative paths", async () => {
    const projectDir = await createTempProject();
    const originalCwd = process.cwd();

    try {
      process.chdir(projectDir);
      await expect(expandSourceInput("src/**/*.py")).resolves.toEqual([
        path.join("src", "package", "__init__.py"),
        path.join("src", "package", "main.py"),
        path.join("src", "package", "nested", "mod.py"),
        path.join("src", "pkg[legacy]", "main.py"),
        path.join("src", "pkgl", "main.py"),
      ]);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("maps relative root glob matches to . instead of an empty argument", async () => {
    const projectDir = await createTempProject();
    const originalCwd = process.cwd();

    try {
      process.chdir(projectDir);
      for (const pattern of ["**", "**/", "./**"]) {
        const sources = await expandSourceInput(pattern);

        expect(sources).toContain(".");
        expect(sources).not.toContain("");
      }
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("excludes hidden paths by default while allowing explicit hidden patterns", async () => {
    const projectDir = await createTempProject();
    const originalCwd = process.cwd();
    await fs.mkdir(path.join(projectDir, ".venv"));
    await fs.writeFile(path.join(projectDir, ".venv", "ignored.py"), "");
    await fs.mkdir(path.join(projectDir, ".tox"));
    await fs.writeFile(path.join(projectDir, ".tox", "ignored.py"), "");

    try {
      process.chdir(projectDir);
      const defaultSources = await expandSourceInput("**/*.py");

      expect(defaultSources).not.toContain(path.join(".venv", "ignored.py"));
      expect(defaultSources).not.toContain(path.join(".tox", "ignored.py"));
      await expect(expandSourceInput(".venv/**/*.py")).resolves.toEqual([
        path.join(".venv", "ignored.py"),
      ]);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("preserves unmatched globs for Ruff to report", async () => {
    const projectDir = await createTempProject();
    const pattern = path.join(projectDir, "src", "**", "missing-*.py");

    await expect(expandSourceInput(pattern)).resolves.toEqual([pattern]);
  });

  it("expands multiple sources in input order", async () => {
    const projectDir = await createTempProject();
    const first = path.join(projectDir, "src", "package", "main.py");
    const second = path.join(projectDir, "src", "package", "nested", "*.py");

    await expect(expandSourceInput(`${first} ${second}`)).resolves.toEqual([
      first,
      path.join(projectDir, "src", "package", "nested", "mod.py"),
    ]);
  });

  it("uses @actions/glob syntax for paths that contain glob metacharacters", async () => {
    const projectDir = await createTempProject();

    await expect(
      expandSourceInput(path.join(projectDir, "src", "pkg[legacy]")),
    ).resolves.toEqual([path.join(projectDir, "src", "pkgl")]);
    await expect(
      expandSourceInput(path.join(projectDir, "src", "pkg[legacy]", "*.py")),
    ).resolves.toEqual([path.join(projectDir, "src", "pkgl", "main.py")]);
  });

  it("supports @actions/glob escaping for literal glob metacharacters", async () => {
    const projectDir = await createTempProject();
    const pattern = path.join(projectDir, "src", "pkg[[]legacy]", "*.py");

    await expect(expandSourceInput(pattern)).resolves.toEqual([
      path.join(projectDir, "src", "pkg[legacy]", "main.py"),
    ]);
  });

  it("does not traverse symlinked directories", async () => {
    const projectDir = await createTempProject();
    const externalDir = path.join(projectDir, "external");
    const symlinkPath = path.join(projectDir, "src", "linked");
    await fs.mkdir(externalDir);
    await fs.writeFile(path.join(externalDir, "external.py"), "");
    await fs.symlink(externalDir, symlinkPath, "dir");

    const sources = await expandSourceInput(
      path.join(projectDir, "src", "**", "*.py"),
    );

    expect(sources).not.toContain(path.join(symlinkPath, "external.py"));
  });

  it("still expands missing paths that contain glob metacharacters", async () => {
    const projectDir = await createTempProject();
    const pattern = path.join(projectDir, "src", "pkg[l]");

    await expect(expandSourceInput(pattern)).resolves.toEqual([
      path.join(projectDir, "src", "pkgl"),
    ]);
  });
});

describe("getVersionSourceDirectory", () => {
  it("does not scan src globs when version input is explicit", async () => {
    await expect(
      getVersionSourceDirectory("../**/*.py", "0.1.0", undefined),
    ).resolves.toBe(".");
  });

  it("does not scan src globs when version-file input is explicit", async () => {
    await expect(
      getVersionSourceDirectory("../**/*.py", undefined, "pyproject.toml"),
    ).resolves.toBe(".");
  });

  it("uses source discovery when no version input is explicit", async () => {
    await expect(
      getVersionSourceDirectory("../**/*.py", undefined, undefined),
    ).rejects.toThrow("Invalid pattern '../**/*.py'");
  });
});

describe("getSourceBasePath", () => {
  it("returns the directory for a plain path", async () => {
    await expect(getSourceBasePath("my-project")).resolves.toBe("my-project");
  });

  it("returns the directory for a dotted path", async () => {
    await expect(getSourceBasePath("./src")).resolves.toBe("./src");
  });

  it("preserves filesystem root paths", async () => {
    const root = path.parse(process.cwd()).root;

    await expect(getSourceBasePath(root)).resolves.toBe(root);
  });

  it("strips glob pattern and returns parent directory", async () => {
    await expect(getSourceBasePath("src/**/*.py")).resolves.toBe("src");
  });

  it("returns . for a top-level glob", async () => {
    await expect(getSourceBasePath("*.py")).resolves.toBe(".");
  });

  it("returns . for empty string", async () => {
    await expect(getSourceBasePath("")).resolves.toBe(".");
  });

  it("uses only the first whitespace-delimited token", async () => {
    await expect(getSourceBasePath("sub1/*.py sub2/")).resolves.toBe("sub1");
  });

  it("handles trailing slash in prefix", async () => {
    await expect(getSourceBasePath("sub/*.py")).resolves.toBe("sub");
  });

  it("uses the parent directory when a glob appears in a filename", async () => {
    await expect(getSourceBasePath("src/file*.py")).resolves.toBe("src");
  });

  it("handles ? glob", async () => {
    await expect(getSourceBasePath("file?.py")).resolves.toBe(".");
  });

  it("handles bracket glob", async () => {
    await expect(getSourceBasePath("file[0-9].py")).resolves.toBe(".");
  });

  it("uses @actions/glob syntax for base paths with glob metacharacters", async () => {
    const projectDir = await createTempProject();
    const originalCwd = process.cwd();

    try {
      process.chdir(projectDir);
      await expect(getSourceBasePath("src/pkg[legacy]")).resolves.toBe(
        path.join("src", "pkgl"),
      );
      await expect(getSourceBasePath("src/pkg[legacy]/*.py")).resolves.toBe(
        path.join("src", "pkgl", "main.py"),
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("supports @actions/glob escaping for version discovery from literal glob metacharacters", async () => {
    const projectDir = await createTempProject();
    const originalCwd = process.cwd();
    const pyprojectPath = path.join(
      projectDir,
      "src",
      "pkg[legacy]",
      "pyproject.toml",
    );
    await fs.writeFile(
      pyprojectPath,
      "[project]\ndependencies = ['ruff==0.6.2']\n",
    );

    try {
      process.chdir(projectDir);
      const sourceBasePath = await getSourceBasePath(
        "src/pkg[[]legacy]/main.py",
      );

      expect(findPyprojectToml(sourceBasePath, projectDir)).toBe(
        await fs.realpath(pyprojectPath),
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("uses the first expanded glob match for version discovery", async () => {
    const projectDir = await createTempProject();
    const originalCwd = process.cwd();
    const pyprojectPath = path.join(
      projectDir,
      "packages",
      "foo",
      "pyproject.toml",
    );
    await fs.mkdir(path.join(projectDir, "packages", "foo", "src"), {
      recursive: true,
    });
    await fs.writeFile(
      pyprojectPath,
      "[project]\ndependencies = ['ruff==0.10.0']\n",
    );
    await fs.writeFile(
      path.join(projectDir, "packages", "foo", "src", "module.py"),
      "",
    );

    try {
      process.chdir(projectDir);
      const sourceBasePath = await getSourceBasePath("packages/*/src/**/*.py");

      expect(sourceBasePath).toBe(
        path.join("packages", "foo", "src", "module.py"),
      );
      const workspaceRoot = await fs.realpath(projectDir);
      expect(findPyprojectToml(sourceBasePath, workspaceRoot)).toBe(
        await fs.realpath(pyprojectPath),
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("uses the unmatched glob fallback when version-discovery glob has no matches", async () => {
    const projectDir = await createTempProject();
    const originalCwd = process.cwd();
    await fs.mkdir(path.join(projectDir, "packages"));

    try {
      process.chdir(projectDir);
      await expect(getSourceBasePath("packages/*/src/**/*.py")).resolves.toBe(
        "packages",
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("does not treat brace expansion as glob syntax", async () => {
    await expect(getSourceBasePath("src/{a,b}/*.py")).resolves.toBe(
      "src/{a,b}",
    );
  });
});
