import { Octokit } from "@octokit/core";
import * as core from "@actions/core";
import { paginateRest } from "@octokit/plugin-paginate-rest";
import { restEndpointMethods } from "@octokit/plugin-rest-endpoint-methods";

import { OWNER, REPO } from "./utils/constants";
import * as semver from "semver";

import { updateChecksums } from "./download/checksum/update-known-checksums";

const PaginatingOctokit = Octokit.plugin(paginateRest, restEndpointMethods);

async function run(): Promise<void> {
  const checksumFilePath = process.argv.slice(2)[0];
  const github_token = process.argv.slice(2)[1];

  const octokit = new PaginatingOctokit({ auth: github_token });

  const response = await octokit.paginate(octokit.rest.repos.listReleases, {
    owner: OWNER,
    repo: REPO,
  });
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
