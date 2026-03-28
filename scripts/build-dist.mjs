import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const builds = [
  {
    entryPoint: path.join(repoRoot, "src", "ruff-action.ts"),
    outfile: path.join(repoRoot, "dist", "ruff-action", "index.cjs"),
    staleOutfile: path.join(repoRoot, "dist", "ruff-action", "index.js"),
  },
  {
    entryPoint: path.join(repoRoot, "src", "update-known-checksums.ts"),
    outfile: path.join(repoRoot, "dist", "update-known-checksums", "index.cjs"),
    staleOutfile: path.join(
      repoRoot,
      "dist",
      "update-known-checksums",
      "index.js",
    ),
  },
];

await Promise.all(
  builds.map(async ({ entryPoint, outfile, staleOutfile }) => {
    await rm(staleOutfile, { force: true });
    await mkdir(path.dirname(outfile), { recursive: true });
    await build({
      bundle: true,
      entryPoints: [entryPoint],
      format: "cjs",
      outfile,
      platform: "node",
      target: "node24",
    });
  }),
);
