import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as semver from "semver";

const mockInfo = jest.fn();
const mockWarning = jest.fn();

jest.unstable_mockModule("@actions/core", () => ({
  debug: jest.fn(),
  info: mockInfo,
  warning: mockWarning,
}));

const mockDownloadTool = jest.fn();
const mockExtractTar = jest.fn();
const mockExtractZip = jest.fn();
const mockCacheDir = jest.fn();

jest.unstable_mockModule("@actions/tool-cache", () => ({
  cacheDir: mockCacheDir,
  downloadTool: mockDownloadTool,
  evaluateVersions: (versions: string[], range: string) =>
    semver.maxSatisfying(versions, range) ?? "",
  extractTar: mockExtractTar,
  extractZip: mockExtractZip,
  find: () => "",
  findAllVersions: () => [],
  isExplicitVersion: (version: string) => semver.valid(version) !== null,
}));

const mockGetLatestVersion = jest.fn();
const mockGetAllVersions = jest.fn();
const mockGetArtifact = jest.fn();

jest.unstable_mockModule("../../src/download/manifest", () => ({
  getAllVersions: mockGetAllVersions,
  getArtifact: mockGetArtifact,
  getLatestVersion: mockGetLatestVersion,
}));

const mockValidateChecksum = jest.fn();

jest.unstable_mockModule("../../src/download/checksum/checksum", () => ({
  validateChecksum: mockValidateChecksum,
}));

const mockCopyFile = jest.fn();
const mockReaddir = jest.fn();

jest.unstable_mockModule("node:fs", () => ({
  promises: {
    copyFile: mockCopyFile,
    readdir: mockReaddir,
  },
}));

const { downloadVersion, resolveVersion, rewriteToMirror } = await import(
  "../../src/download/download-version"
);

describe("download-version", () => {
  beforeEach(() => {
    mockInfo.mockReset();
    mockWarning.mockReset();
    mockDownloadTool.mockReset();
    mockExtractTar.mockReset();
    mockExtractZip.mockReset();
    mockCacheDir.mockReset();
    mockGetLatestVersion.mockReset();
    mockGetAllVersions.mockReset();
    mockGetArtifact.mockReset();
    mockValidateChecksum.mockReset();
    mockCopyFile.mockReset();
    mockReaddir.mockReset();

    mockDownloadTool.mockResolvedValue("/tmp/downloaded");
    mockExtractTar.mockResolvedValue("/tmp/extracted");
    mockExtractZip.mockResolvedValue("/tmp/extracted");
    mockCacheDir.mockResolvedValue("/tmp/cached");
    mockReaddir.mockResolvedValue(["ruff"]);
  });

  describe("resolveVersion", () => {
    it("uses the default manifest to resolve latest", async () => {
      mockGetLatestVersion.mockResolvedValue("0.15.8");

      const version = await resolveVersion("latest", undefined);

      expect(version).toBe("0.15.8");
      expect(mockGetLatestVersion).toHaveBeenCalledTimes(1);
      expect(mockGetLatestVersion).toHaveBeenCalledWith(undefined);
    });

    it("uses the default manifest to resolve available versions", async () => {
      mockGetAllVersions.mockResolvedValue(["0.15.8", "0.15.7"]);

      const version = await resolveVersion("0.15.x", undefined);

      expect(version).toBe("0.15.8");
      expect(mockGetAllVersions).toHaveBeenCalledTimes(1);
      expect(mockGetAllVersions).toHaveBeenCalledWith(undefined);
    });

    it("uses manifest-file when provided", async () => {
      mockGetAllVersions.mockResolvedValue(["0.15.8", "0.15.7"]);

      const version = await resolveVersion(
        "0.15.x",
        "https://example.com/custom.ndjson",
      );

      expect(version).toBe("0.15.8");
      expect(mockGetAllVersions).toHaveBeenCalledWith(
        "https://example.com/custom.ndjson",
      );
    });
  });

  describe("downloadVersion", () => {
    it("fails when manifest lookup fails", async () => {
      mockGetArtifact.mockRejectedValue(new Error("manifest unavailable"));

      await expect(
        downloadVersion(
          "unknown-linux-gnu",
          "x86_64",
          "0.15.8",
          undefined,
          "token",
        ),
      ).rejects.toThrow("manifest unavailable");

      expect(mockDownloadTool).not.toHaveBeenCalled();
      expect(mockValidateChecksum).not.toHaveBeenCalled();
    });

    it("fails when no matching artifact exists in the default manifest", async () => {
      mockGetArtifact.mockResolvedValue(undefined);

      await expect(
        downloadVersion(
          "unknown-linux-gnu",
          "x86_64",
          "0.15.8",
          undefined,
          "token",
        ),
      ).rejects.toThrow(
        "Could not find artifact for version 0.15.8, arch x86_64, platform unknown-linux-gnu in https://raw.githubusercontent.com/astral-sh/versions/main/v1/ruff.ndjson .",
      );

      expect(mockDownloadTool).not.toHaveBeenCalled();
      expect(mockValidateChecksum).not.toHaveBeenCalled();
    });

    it("uses built-in checksums for default manifest downloads", async () => {
      mockGetArtifact.mockResolvedValue({
        archiveFormat: "tar.gz",
        checksum: "manifest-checksum-that-should-be-ignored",
        downloadUrl: "https://example.com/ruff.tar.gz",
      });

      await downloadVersion(
        "unknown-linux-gnu",
        "x86_64",
        "0.15.8",
        undefined,
        "token",
      );

      expect(mockValidateChecksum).toHaveBeenCalledWith(
        undefined,
        "/tmp/downloaded",
        "x86_64",
        "unknown-linux-gnu",
        "0.15.8",
      );
    });

    it("rewrites GitHub Releases URLs to the Astral mirror", async () => {
      mockGetArtifact.mockResolvedValue({
        archiveFormat: "tar.gz",
        checksum: "abc123",
        downloadUrl:
          "https://github.com/astral-sh/ruff/releases/download/0.15.8/ruff-x86_64-unknown-linux-gnu.tar.gz",
      });

      await downloadVersion(
        "unknown-linux-gnu",
        "x86_64",
        "0.15.8",
        undefined,
        "token",
      );

      expect(mockDownloadTool).toHaveBeenCalledWith(
        "https://releases.astral.sh/github/ruff/releases/download/0.15.8/ruff-x86_64-unknown-linux-gnu.tar.gz",
        undefined,
        undefined,
      );
    });

    it("does not rewrite non-GitHub URLs", async () => {
      mockGetArtifact.mockResolvedValue({
        archiveFormat: "tar.gz",
        checksum: "abc123",
        downloadUrl: "https://example.com/ruff.tar.gz",
      });

      await downloadVersion(
        "unknown-linux-gnu",
        "x86_64",
        "0.15.8",
        undefined,
        "token",
      );

      expect(mockDownloadTool).toHaveBeenCalledWith(
        "https://example.com/ruff.tar.gz",
        undefined,
        undefined,
      );
    });

    it("falls back to GitHub Releases when the mirror download fails", async () => {
      mockGetArtifact.mockResolvedValue({
        archiveFormat: "tar.gz",
        checksum: "abc123",
        downloadUrl:
          "https://github.com/astral-sh/ruff/releases/download/0.15.8/ruff-x86_64-unknown-linux-gnu.tar.gz",
      });

      mockDownloadTool
        .mockRejectedValueOnce(new Error("mirror unavailable"))
        .mockResolvedValueOnce("/tmp/downloaded");

      await downloadVersion(
        "unknown-linux-gnu",
        "x86_64",
        "0.15.8",
        undefined,
        "token",
      );

      expect(mockDownloadTool).toHaveBeenCalledTimes(2);
      expect(mockDownloadTool).toHaveBeenNthCalledWith(
        1,
        "https://releases.astral.sh/github/ruff/releases/download/0.15.8/ruff-x86_64-unknown-linux-gnu.tar.gz",
        undefined,
        undefined,
      );
      expect(mockDownloadTool).toHaveBeenNthCalledWith(
        2,
        "https://github.com/astral-sh/ruff/releases/download/0.15.8/ruff-x86_64-unknown-linux-gnu.tar.gz",
        undefined,
        "token",
      );
      expect(mockWarning).toHaveBeenCalledWith(
        "Failed to download from mirror, falling back to GitHub Releases: mirror unavailable",
      );
    });

    it("falls back to the canonical old GitHub Releases URL", async () => {
      mockGetArtifact.mockResolvedValue({
        archiveFormat: "tar.gz",
        checksum: "abc123",
        downloadUrl:
          "https://github.com/astral-sh/ruff/releases/download/0.4.7/ruff-x86_64-unknown-linux-gnu.tar.gz",
      });

      mockDownloadTool
        .mockRejectedValueOnce(new Error("mirror unavailable"))
        .mockResolvedValueOnce("/tmp/downloaded");

      await downloadVersion(
        "unknown-linux-gnu",
        "x86_64",
        "0.4.7",
        undefined,
        "token",
      );

      expect(mockDownloadTool).toHaveBeenNthCalledWith(
        2,
        "https://github.com/astral-sh/ruff/releases/download/v0.4.7/ruff-0.4.7-x86_64-unknown-linux-gnu.tar.gz",
        undefined,
        "token",
      );
    });

    it("does not fall back when checksum validation fails", async () => {
      mockGetArtifact.mockResolvedValue({
        archiveFormat: "tar.gz",
        checksum: "abc123",
        downloadUrl:
          "https://github.com/astral-sh/ruff/releases/download/0.15.8/ruff-x86_64-unknown-linux-gnu.tar.gz",
      });
      mockValidateChecksum.mockRejectedValue(new Error("bad checksum"));

      await expect(
        downloadVersion(
          "unknown-linux-gnu",
          "x86_64",
          "0.15.8",
          undefined,
          "token",
        ),
      ).rejects.toThrow("bad checksum");

      expect(mockDownloadTool).toHaveBeenCalledTimes(1);
      expect(mockWarning).not.toHaveBeenCalled();
    });

    it("does not fall back when extraction fails", async () => {
      mockGetArtifact.mockResolvedValue({
        archiveFormat: "tar.gz",
        checksum: "abc123",
        downloadUrl:
          "https://github.com/astral-sh/ruff/releases/download/0.15.8/ruff-x86_64-unknown-linux-gnu.tar.gz",
      });
      mockExtractTar.mockRejectedValue(new Error("extract failed"));

      await expect(
        downloadVersion(
          "unknown-linux-gnu",
          "x86_64",
          "0.15.8",
          undefined,
          "token",
        ),
      ).rejects.toThrow("extract failed");

      expect(mockDownloadTool).toHaveBeenCalledTimes(1);
      expect(mockWarning).not.toHaveBeenCalled();
    });

    it("does not fall back for non-GitHub URLs", async () => {
      mockGetArtifact.mockResolvedValue({
        archiveFormat: "tar.gz",
        checksum: "abc123",
        downloadUrl: "https://example.com/ruff.tar.gz",
      });

      mockDownloadTool.mockRejectedValue(new Error("download failed"));

      await expect(
        downloadVersion(
          "unknown-linux-gnu",
          "x86_64",
          "0.15.8",
          undefined,
          "token",
        ),
      ).rejects.toThrow("download failed");

      expect(mockDownloadTool).toHaveBeenCalledTimes(1);
    });

    it("uses manifest-file checksum metadata when checksum input is unset", async () => {
      mockGetArtifact.mockResolvedValue({
        archiveFormat: "tar.gz",
        checksum: "manifest-checksum",
        downloadUrl: "https://example.com/custom-ruff.tar.gz",
      });

      await downloadVersion(
        "unknown-linux-gnu",
        "x86_64",
        "0.15.8",
        "",
        "token",
        "https://example.com/custom.ndjson",
      );

      expect(mockValidateChecksum).toHaveBeenCalledWith(
        "manifest-checksum",
        "/tmp/downloaded",
        "x86_64",
        "unknown-linux-gnu",
        "0.15.8",
      );
    });

    it("prefers checksum input over manifest-file checksum metadata", async () => {
      mockGetArtifact.mockResolvedValue({
        archiveFormat: "tar.gz",
        checksum: "manifest-checksum",
        downloadUrl: "https://example.com/custom-ruff.tar.gz",
      });

      await downloadVersion(
        "unknown-linux-gnu",
        "x86_64",
        "0.15.8",
        "user-checksum",
        "token",
        "https://example.com/custom.ndjson",
      );

      expect(mockValidateChecksum).toHaveBeenCalledWith(
        "user-checksum",
        "/tmp/downloaded",
        "x86_64",
        "unknown-linux-gnu",
        "0.15.8",
      );
    });

    it("preserves tar extraction behavior for newer versions", async () => {
      mockGetArtifact.mockResolvedValue({
        archiveFormat: "tar.gz",
        checksum: "abc123",
        downloadUrl: "https://example.com/ruff.tar.gz",
      });

      await downloadVersion(
        "unknown-linux-gnu",
        "x86_64",
        "0.15.8",
        "user-checksum",
        "token",
      );

      expect(mockExtractTar).toHaveBeenCalledWith("/tmp/downloaded");
      expect(mockCacheDir).toHaveBeenCalledWith(
        "/tmp/extracted/ruff-x86_64-unknown-linux-gnu",
        "ruff",
        "0.15.8",
        "x86_64",
      );
    });

    it("preserves tar extraction behavior for older versions", async () => {
      mockGetArtifact.mockResolvedValue({
        archiveFormat: "tar.gz",
        checksum: "abc123",
        downloadUrl: "https://example.com/ruff.tar.gz",
      });

      await downloadVersion(
        "unknown-linux-gnu",
        "x86_64",
        "0.4.10",
        undefined,
        "token",
      );

      expect(mockCacheDir).toHaveBeenCalledWith(
        "/tmp/extracted",
        "ruff",
        "0.4.10",
        "x86_64",
      );
    });

    it("preserves zip extraction behavior on Windows", async () => {
      mockGetArtifact.mockResolvedValue({
        archiveFormat: "zip",
        checksum: "abc123",
        downloadUrl: "https://example.com/ruff.zip",
      });

      await downloadVersion(
        "pc-windows-msvc",
        "x86_64",
        "0.15.8",
        undefined,
        "token",
      );

      expect(mockCopyFile).toHaveBeenCalledWith(
        "/tmp/downloaded",
        "/tmp/downloaded.zip",
      );
      expect(mockExtractZip).toHaveBeenCalledWith("/tmp/downloaded.zip");
      expect(mockCacheDir).toHaveBeenCalledWith(
        "/tmp/extracted",
        "ruff",
        "0.15.8",
        "x86_64",
      );
    });
  });

  describe("rewriteToMirror", () => {
    it("rewrites a GitHub Releases URL to the Astral mirror", () => {
      expect(
        rewriteToMirror(
          "https://github.com/astral-sh/ruff/releases/download/0.15.8/ruff-x86_64-unknown-linux-gnu.tar.gz",
        ),
      ).toBe(
        "https://releases.astral.sh/github/ruff/releases/download/0.15.8/ruff-x86_64-unknown-linux-gnu.tar.gz",
      );
    });

    it("returns undefined for non-GitHub URLs", () => {
      expect(
        rewriteToMirror("https://example.com/ruff.tar.gz"),
      ).toBeUndefined();
    });

    it("returns undefined for a different GitHub repo", () => {
      expect(
        rewriteToMirror(
          "https://github.com/other/repo/releases/download/v1.0/file.tar.gz",
        ),
      ).toBeUndefined();
    });
  });
});
