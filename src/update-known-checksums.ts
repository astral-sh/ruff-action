import * as core from "@actions/core";
import { Octokit } from "@octokit/core";
import { paginateRest } from "@octokit/plugin-paginate-rest";
import { restEndpointMethods } from "@octokit/plugin-rest-endpoint-methods";
import * as semver from "semver";
import { updateChecksums } from "./download/checksum/update-known-checksums";
import { OWNER, REPO } from "./utils/constants";
import {
  isRetryableError,
  NonRetryableError,
  RetryableError,
  withRetry,
} from "./utils/retry";

const PaginatingOctokit = Octokit.plugin(paginateRest, restEndpointMethods);

async function run(): Promise<void> {
  const checksumFilePath = process.argv.slice(2)[0];
  const github_token = process.argv.slice(2)[1];

  const response = await withRetry(
    async () => {
      try {
        const octokit = new PaginatingOctokit({ auth: github_token });
        return await octokit.paginate(octokit.rest.repos.listReleases, {
          owner: OWNER,
          repo: REPO,
        });
      } catch (error) {
        const err = error as Error;
        if (isRetryableError(err)) {
          throw new RetryableError(
            `Failed to list releases for checksum update: ${err.message}`,
            err,
          );
        } else {
          throw new NonRetryableError(
            `Failed to list releases for checksum update: ${err.message}`,
            err,
          );
        }
      }
    },
    { maxRetries: 3, timeoutMs: 60000 },
    "list releases for checksum update",
  );

  const downloadUrls: string[] = response.flatMap((release) =>
    release.assets
      .filter((asset) => asset.name.endsWith(".sha256"))
      .map((asset) => asset.browser_download_url),
  );
  await updateChecksums(checksumFilePath, downloadUrls);

  const latestVersion = response
    .map((release) => release.tag_name)
    .sort(semver.rcompare)[0];
  core.setOutput("latest-version", latestVersion);
}

run();
