# Ruff GitHub Action

[![Ruff](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json)](https://github.com/astral-sh/ruff)
[![image](https://img.shields.io/pypi/v/ruff.svg)](https://pypi.python.org/pypi/ruff)
[![image](https://img.shields.io/pypi/l/ruff.svg)](https://github.com/astral-sh/ruff-action/blob/main/LICENSE)
[![image](https://img.shields.io/pypi/pyversions/ruff.svg)](https://pypi.python.org/pypi/ruff)
[![Actions status](https://github.com/astral-sh/ruff-action/workflows/CI/badge.svg)](https://github.com/astral-sh/ruff-action/actions)

## Overview

The Ruff GitHub Action enforces code cleanliness by running Ruff against your repository. This ensures adherence to the [Rules](https://docs.astral.sh/ruff/rules/) defined in your configuration file. Whether you need Ruff to lint, fix, or perform any of its robust features, this action has you covered.

## Compatibility

This action supports all GitHub-hosted runner operating systems. While it likely runs on self-hosted runners, be aware that additional dependencies may be required. Note that only published versions of Ruff from PyPI are supported.

## Usage

### Pre-requisites

Create a workflow `.yml` file in your repository's `.github/workflows` directory. An [example workflow](#example-workflows) is available below. For more information, see the GitHub Help Documentation for [Creating a workflow file](https://help.github.com/en/articles/configuring-a-workflow#creating-a-workflow-file).

### Inputs

> [!WARNING]
> Note that `isolated` and `config_path`, as well as `version` and `use_pyproject`, are mutually exclusive and cannot be configured simultaneously.

- `args`: Arguments passed to Ruff. Use `ruff --help` to see available options. Default: `check`.
- `src`: Source to run Ruff. Default: `'.'`.
- `version`: The version of Ruff to use, e.g. `"0.5.0"`. Default: `""`.
- `use_pyproject`: Whether to use pyproject.toml to configure Ruff. Default: `false`.
- `changed-files`: Whether to only run Ruff on changed files. Default: `false`.
- `config_path`: Path to a configuration file (`pyproject.toml` or `ruff.toml`). Default: `/`.
- `isolated`: Ignore all configuration files. Default: `false`.

### Example Workflows

To integrate Ruff into your GitHub workflow, create a workflow configuration file (e.g., `.github/workflows/ruff.yml`) in your repository. This file will define the steps for running Ruff every time a push or pull request is made.

#### Basic Workflow

```yaml
name: Ruff

on: [push, pull_request]

jobs:
  ruff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/ruff-action@v1
```

#### Run `ruff` with specific arguments and source path

```yaml
name: Ruff

on: [push, pull_request]

jobs:
  ruff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/ruff-action@v1
        with:
          args: "--select I --fix"
          src: "src/"
```

#### Run `ruff` for changed files only

```yaml
name: Ruff

on: [push, pull_request]

jobs:
  ruff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/ruff-action@v1
        with:
          changed-files: "true"
```

### Run `ruff` on `--isolated` mode

```yaml
name: Ruff

on: [push, pull_request]

jobs:
  ruff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/ruff-action@v1
        with:
          changed-files: "true"
          isolated: "true"
```

## Contributing

We would love for you to contribute to. Pull requests are welcome! Please see the [CONTRIBUTING.md](CONTRIBUTING.md) for more information.

## License

The scripts and documentation in this project are released under the [MIT License](LICENSE)
