# ruff-action

A GitHub Action to run [ruff](https://github.com/astral-sh/ruff).

This action is commonly used as a pass/fail test to ensure your repository stays
clean, abiding the [rules](https://docs.astral.sh/ruff/rules/) specified in your
configuration. Though it runs `ruff check` by default, the action can do
anything `ruff` can (ex, fix).

## Contents

- [Usage](#usage)
  - [Basic](#basic)
  - [Specify a different source directory](#specify-a-different-source-directory)
  - [Specify multiple files](#specify-multiple-files)
  - [Use to install ruff](#use-to-install-ruff)
  - [Use `ruff format`](#use-ruff-format)
  - [Install specific versions](#install-specific-versions)
    - [Install the latest version](#install-the-latest-version)
    - [Install a specific version](#install-a-specific-version)
    - [Install a version by supplying a semver range or pep440 specifier](#install-a-version-by-supplying-a-semver-range-or-pep440-specifier)
    - [Install a version from a specified version file](#install-a-version-from-a-specified-version-file)
    - [Install using a custom manifest URL](#install-using-a-custom-manifest-url)
  - [Validate checksum](#validate-checksum)
  - [GitHub authentication token](#github-authentication-token)
- [Outputs](#outputs)

## Usage

| Input           | Description                                                                                                                                | Default            |
|-----------------|--------------------------------------------------------------------------------------------------------------------------------------------|--------------------|
| `version`       | The version of Ruff to install. See [Install specific versions](#install-specific-versions)                                                | discovered from `pyproject.toml`, else `latest` |
| `version-file`  | The file to read the version from. See [Install a version from a specified version file](#install-a-version-from-a-specified-version-file) | None               |
| `manifest-file` | URL to a custom Ruff manifest in the `astral-sh/versions` format.                                                                          | None               |
| `download-from-astral-mirror` | Download Ruff from the Astral mirror instead of directly from GitHub Releases.                                                   | `true`             |
| `args`          | The arguments to pass to the `ruff` command. See [Configuring Ruff]                                                                        | `check`            |
| `src`           | Source path(s) to run `ruff` on. Supports glob patterns.                                                                                   | [github.workspace] |
| `checksum`      | The sha256 checksum of the downloaded artifact.                                                                                            | None               |
| `github-token`  | The GitHub token to use when downloading Ruff release artifacts from GitHub.                                                               | `GITHUB_TOKEN`     |

By default, Ruff version metadata is resolved from the
[`astral-sh/versions` Ruff manifest](https://github.com/astral-sh/versions/blob/main/v1/ruff.ndjson).

### Basic

```yaml
- uses: astral-sh/ruff-action@v4.0.0
```

### Specify a different source directory

```yaml
- uses: astral-sh/ruff-action@v4.0.0
  with:
    src: "./src"
```

### Specify multiple files

Separate multiple `src` values with whitespace.

```yaml
- uses: astral-sh/ruff-action@v4.0.0
  with:
    src: >-
      path/to/file1.py
      path/to/file2.py
```

### Use glob patterns

Glob patterns (`*`, `?`, `[...]`, and `**`) are expanded by the action using
[`@actions/glob`](https://github.com/actions/toolkit/tree/main/packages/glob),
so they work consistently across Linux, macOS, and Windows runners. This action
does not emulate Bash, PowerShell, or other shell-specific glob expansion.

Hidden files and directories are skipped by default; target them explicitly, for
example with `.venv/**/*.py`, to include them. If a pattern does not match any
files, the original pattern is passed to Ruff so Ruff can report the missing
path. Literal glob metacharacters in file or directory names must be escaped
using `@actions/glob` syntax.

```yaml
- uses: astral-sh/ruff-action@v3
  with:
    src: "src/**/*.py"
```

> [!NOTE]
> When using multiple patterns, only the first is used to search for
> `pyproject.toml` to determine the Ruff version. Use the `version` input
> for explicit control. Large glob expansions may hit command-line length limits,
> especially on Windows.

### Use to install ruff

This action adds ruff to the PATH, so you can use it in subsequent steps.

```yaml
- uses: astral-sh/ruff-action@v4.0.0
- run: ruff check --fix
- run: ruff format
```

By default, this action runs `ruff check` after installation.
If you do not want to run any `ruff` command but only install it,
you can use the `args` input to overwrite the default value (`check`):

```yaml
- name: Install ruff without running check or format
  uses: astral-sh/ruff-action@v4.0.0
  with:
    args: "--version"
```

### Use `ruff format`

```yaml
- uses: astral-sh/ruff-action@v4.0.0
  with:
    args: "format --check --diff"
```

### Install specific versions

By default this action searches upward from `src` until the workspace root to find the nearest
`pyproject.toml` and determine the Ruff version to install. If no `pyproject.toml` file is found,
or no Ruff version is defined in `project.dependencies`, `project.optional-dependencies`,
`dependency-groups`, or supported Poetry dependency tables, the latest version is installed.

> [!NOTE]
> This action does only support ruff versions v0.0.247 and above.

#### Install the latest version

```yaml
- name: Install the latest version of ruff
  uses: astral-sh/ruff-action@v4.0.0
  with:
    version: "latest"
```

#### Install a specific version

```yaml
- name: Install a specific version of ruff
  uses: astral-sh/ruff-action@v4.0.0
  with:
    version: "0.4.4"
```

#### Install a version by supplying a semver range or pep440 specifier

You can specify a [semver range](https://github.com/npm/node-semver?tab=readme-ov-file#ranges)
or [pep440 specifier](https://peps.python.org/pep-0440/#version-specifiers)
to install the latest version that satisfies the range.

```yaml
- name: Install a semver range of ruff
  uses: astral-sh/ruff-action@v4.0.0
  with:
    version: ">=0.4.0"
```

```yaml
- name: Pinning a minor version of ruff
  uses: astral-sh/ruff-action@v4.0.0
  with:
    version: "0.4.x"
```

```yaml
- name: Install a pep440-specifier-satisfying version of ruff
  uses: astral-sh/ruff-action@v4.0.0
  with:
    version: ">=0.11.10,<0.12.0"
```

#### Install a version from a specified version file

You can specify a file to read the version from.
Currently `pyproject.toml`, `requirements.txt` and `uv.lock` are supported. If the file cannot
be parsed or does not contain a Ruff version, the action warns and falls back to `latest`.

```yaml
- name: Install a version from a specified version file
  uses: astral-sh/ruff-action@v4.0.0
  with:
    version-file: "my-path/to/pyproject.toml-requirements.txt-or-uv.lock"
```

Version resolution precedence is:

1. `version`
2. `version-file`
3. nearest discoverable `pyproject.toml` found by searching upward from `src`
4. `latest`

#### Install using a custom manifest URL

You can override the default `astral-sh/versions` manifest with `manifest-file`.
This affects both version resolution and artifact selection.

```yaml
- name: Install Ruff from a custom manifest
  uses: astral-sh/ruff-action@v4.0.0
  with:
    version: "latest"
    manifest-file: "https://example.com/ruff.ndjson"
```

### Validate checksum

You can specify a checksum to validate the downloaded executable. Checksums up to the default version
are automatically verified by this action. The sha256 hashes can be found on the
[releases page](https://github.com/astral-sh/ruff/releases) of the ruff repo.

```yaml
- name: Install a specific version and validate the checksum
  uses: astral-sh/ruff-action@v4.0.0
  with:
    version: "0.7.4"
    checksum: "0de731c669b9ece77e799ac3f4a160c30849752714d9775c94cc4cfaf326860c"
```

### GitHub authentication token

By default, this action resolves available Ruff versions from
[`astral-sh/versions`](https://github.com/astral-sh/versions) and downloads release artifacts from `https://releases.astral.sh`. If this fails this action falls back to downloading from the GitHub releases page of the Ruff repository.

Set `download-from-astral-mirror` to `false` to skip the Astral mirror and download directly from GitHub Releases.

You can provide a token via `github-token` to authenticate GitHub Releases downloads. By default, the
`GITHUB_TOKEN` secret is used, which is automatically provided by GitHub Actions.

If the default
[permissions for the GitHub token](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication#permissions-for-the-github_token)
are not sufficient, you can provide a custom GitHub token with the necessary permissions.

```yaml
- name: Install the latest version of ruff with a custom GitHub token
  uses: astral-sh/ruff-action@v4.0.0
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
