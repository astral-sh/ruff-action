# ruff-action

> [!NOTE]
>
> This Action is a fork of
> [chartboost/ruff-action](https://github.com/ChartBoost/ruff-action), which is
> no longer maintained. The Action is largely unchanged, but will be overhauled
> in a future major release.

A [GitHub Action](https://github.com/features/actions) to run
[Ruff](https://github.com/astral-sh/ruff).

This action is commonly used as a pass/fail test to ensure your repository stays
clean, abiding the [Rules](https://docs.astral.sh/ruff/rules/) specified in your
configuration. Though it runs `ruff`, the action can do anything `ruff` can (ex,
fix).

## Compatibility

This action is known to support all GitHub-hosted runner OSes. It likely can run
on self-hosted runners, but might need specific dependencies. Only published
versions of Ruff are supported (i.e., whatever is available on
[PyPI](https://pypi.org/project/ruff/)).

## Basic Usage

Create a file (ex: `.github/workflows/ruff.yml`) inside your repository with:

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

## Advanced Usage

The Ruff action can be customized via optional configuration parameters passed
to Ruff (using `with:`):

- `version`: Must be a Ruff release available on
  [PyPI](https://pypi.org/project/ruff/). Defaults to the latest Ruff release.
  You can pin a version, or use any valid version specifier.
- `args`: The arguments to pass to the `ruff` command. Defaults to `check`,
  which lints the current directory.
- `src`: The directory to run `ruff` in. Defaults to the root of the repository.

See
[Configuring Ruff](https://github.com/astral-sh/ruff/blob/main/docs/configuration.md)
for details

### Use a different ruff version

```yaml
- uses: astral-sh/ruff-action@v1
  with:
    version: 0.2.2
```

### Specify a different source directory

```yaml
- uses: astral-sh/ruff-action@v1
  with:
    src: "./src"
```

### Use `ruff format`

```yaml
- uses: astral-sh/ruff-action@v1
  with:
    args: "format --check"
```

### Only run ruff on changed files

```yaml
- uses: astral-sh/ruff-action@v1
  with:
    changed-files: "true"
```

## License

Apache

<div align="center">
  <a target="_blank" href="https://astral.sh" style="background:none">
    <img src="https://raw.githubusercontent.com/astral-sh/uv/main/assets/svg/Astral.svg" alt="Made by Astral">
  </a>
</div>
