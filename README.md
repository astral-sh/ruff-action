# ruff-action

A GitHub Action to run [ruff](https://github.com/astral-sh/ruff).

This action is commonly used as a pass/fail test to ensure your repository stays
clean, abiding the [rules](https://docs.astral.sh/ruff/rules/) specified in your
configuration. Though it runs `ruff`, the action can do anything `ruff` can (ex,
fix).

## Contents

- [Usage](#usage)
  - [Basic](#basic)
  - [Specify a different source directory](#specify-a-different-source-directory)
  - [Specify multiple files](#specify-multiple-files)
  - [Use to install ruff](#use-to-install-ruff)
  - [Use `ruff format`](#use-ruff-format)
  - [Install specific versions](#install-specific-versions)
    - [Install the latest version (default)](#install-the-latest-version-default)
    - [Install a specific version](#install-a-specific-version)
    - [Install a version by supplying a semver range](#install-a-version-by-supplying-a-semver-range)
  - [Validate checksum](#validate-checksum)
  - [GitHub authentication token](#github-authentication-token)
- [Outputs](#outputs)

## Usage

| Input          | Description                                                                                 | Default            |
|----------------|---------------------------------------------------------------------------------------------|--------------------|
| `version`      | The version of Ruff to install. See [Install specific versions](#install-specific-versions) | `latest`           |
| `args`         | The arguments to pass to the `ruff` command. See [Configuring Ruff]                         | `check`            |
| `src`          | The directory or single files to run `ruff` on.                                             | [github.workspace] |
| `checksum`     | The sha256 checksum of the downloaded executable.                                           | None               |
| `github-token` | The GitHub token to use for authentication.                                                 | `GITHUB_TOKEN`     |

### Basic

```yaml
- uses: astral-sh/ruff-action@v2
```

### Specify a different source directory

```yaml
- uses: astral-sh/ruff-action@v2
  with:
    src: "./src"
```

### Specify multiple files

```yaml
- uses: astral-sh/ruff-action@v2
  with:
    src: >-
      path/to/file1.py
      path/to/file2.py
```

### Use to install ruff

This action adds ruff to the PATH, so you can use it in subsequent steps.

```yaml
- uses: astral-sh/ruff-action@v2
- run: ruff check --fix
- run: ruff format
```

### Use `ruff format`

```yaml
- uses: astral-sh/ruff-action@v2
  with:
    args: "format --check"
```

### Install specific versions

#### Install the latest version (default)

```yaml
- name: Install the latest version of ruff
  uses: astral-sh/ruff-action@v2
  with:
    version: "latest"
```

> [!TIP]
>
> Using `latest` requires to download the ruff executable on every run, which incurs a cost
> (especially on self-hosted runners). As a best practice, consider pinning the version to a
> specific release.

### Install a specific version

```yaml
- name: Install a specific version of ruff
  uses: astral-sh/ruff-action@v2
  with:
    version: "0.4.4"
```

### Install a version by supplying a semver range

You can specify a [semver range](https://github.com/npm/node-semver?tab=readme-ov-file#ranges)
to install the latest version that satisfies the range.

```yaml
- name: Install a semver range of ruff
  uses: astral-sh/ruff-action@v2
  with:
    version: ">=0.4.0"
```

```yaml
- name: Pinning a minor version of ruff
  uses: astral-sh/ruff-action@v2
  with:
    version: "0.4.x"
```

### Validate checksum

You can specify a checksum to validate the downloaded executable. Checksums up to the default version
are automatically verified by this action. The sha256 hashes can be found on the
[releases page](https://github.com/astral-sh/ruff/releases) of the ruff repo.

```yaml
- name: Install a specific version and validate the checksum
  uses: astral-sh/ruff-action@v2
  with:
    version: "0.7.4"
    checksum: "0de731c669b9ece77e799ac3f4a160c30849752714d9775c94cc4cfaf326860c"
```

### GitHub authentication token

This action uses the GitHub API to fetch the ruff release artifacts. To avoid hitting the GitHub API
rate limit too quickly, an authentication token can be provided via the `github-token` input. By
default, the `GITHUB_TOKEN` secret is used, which is automatically provided by GitHub Actions.

If the default
[permissions for the GitHub token](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication#permissions-for-the-github_token)
are not sufficient, you can provide a custom GitHub token with the necessary permissions.

```yaml
- name: Install the latest version of ruff with a custom GitHub token
  uses: astral-sh/ruff-action@v2
  with:
    github-token: ${{ secrets.CUSTOM_GITHUB_TOKEN }}
```

## Outputs

| Output         | Description                             |
|----------------|-----------------------------------------|
| `ruff-version` | The version of Ruff that was installed. |


<div align="center">
  <a target="_blank" href="https://astral.sh" style="background:none">
    <img src="https://raw.githubusercontent.com/astral-sh/uv/main/assets/svg/Astral.svg" alt="Made by Astral">
  </a>
</div>

[Configuring Ruff]: https://github.com/astral-sh/ruff/blob/main/docs/configuration.md
[github.workspace]: https://docs.github.com/en/actions/reference/context-and-expression-syntax-for-github-actions#github-context
