"""GitHub Action for Ruff."""

import os
import re
import shlex
import subprocess
import sys
from pathlib import Path

ACTION_PATH = Path(os.environ["GITHUB_ACTION_PATH"])
ARGS = os.getenv("INPUT_ARGS", default="")
SRC = os.getenv("INPUT_SRC", default="")

VERSION = os.getenv("INPUT_VERSION", default="")
RUFF_VERSION_RE = re.compile(r"^ruff([^A-Z0-9._-]+.*)$", re.IGNORECASE)

# Changed files support
CHANGED_FILES = os.getenv("CHANGED_FILES", "")
CHANGED_FILES_ENABLED = os.getenv("CHANGED_FILES_ENABLED", default="false") == "true"

# Configurations
CONFIG_PATH = os.getenv("CONFIG_PATH", default="/")
USE_ISOLATED = os.getenv("USE_ISOLATED", default="false") == "true"
USE_PYPROJECT = os.getenv("INPUT_USE_PYPROJECT") == "true"


def determine_version() -> str:
    """
    Determine the version to install.

    The version can be specified either via the `with.version` input or via the
    pyproject.toml file if `with.use_pyproject` is set to `true`.
    """
    if USE_PYPROJECT and VERSION:
        print(
            "::error::'with.version' and 'with.use_pyproject' inputs are mutually "
            "exclusive.",
            file=sys.stderr,
            flush=True,
        )
        sys.exit(1)

    if USE_PYPROJECT:
        return read_version_from_pyproject()

    if VERSION and VERSION[0].isdigit():
        return f"=={VERSION}"

    return VERSION


def read_version_from_pyproject() -> str:
    """Read the version specifier from the `pyproject.toml` file."""
    if sys.version_info < (3, 7):
        print(
            "::error::'with.use_pyproject' input requires Python 3.7 or later.",
            file=sys.stderr,
            flush=True,
        )
        sys.exit(1)

    import tomllib  # type: ignore[import-not-found,unreachable]

    try:
        with Path("pyproject.toml").open("rb") as fp:
            pyproject = tomllib.load(fp)
    except FileNotFoundError:
        print(
            "::error::'with.use_pyproject' input requires a pyproject.toml file.",
            file=sys.stderr,
            flush=True,
        )
        sys.exit(1)

    version = pyproject.get("tool", {}).get("ruff", {}).get("required-version")
    if version is not None:
        return f"=={version}"

    arrays = [
        pyproject.get("project", {}).get("dependencies"),
        *pyproject.get("project", {}).get("optional-dependencies", {}).values(),
    ]
    for array in arrays:
        version = find_version_in_array(array)
        if version is not None:
            break

    if version is None:
        print(
            "::error::'ruff' dependency missing from pyproject.toml.",
            file=sys.stderr,
            flush=True,
        )
        sys.exit(1)

    return version


def find_version_in_array(array: object) -> str | None:
    """Find the version specifier in an array of dependencies."""
    if not isinstance(array, list):
        return None

    try:
        for item in array:
            item = item.split(";")[0]
            if item == "ruff":
                print(
                    "::error::Version specifier missing for 'ruff' dependency in "
                    "pyproject.toml.",
                    file=sys.stderr,
                    flush=True,
                )
                sys.exit(1)
            elif m := RUFF_VERSION_RE.match(item):
                return m.group(1).strip()
    except TypeError:
        pass

    return None


def get_config_path(path: str = CONFIG_PATH) -> str:
    """
    Search for `pyproject.toml` or `ruff.toml` in the specified PATH.

    If the PATH is a file, return the PATH. Otherwise, search for the config files.
    """
    if Path(path).is_file():
        return path

    for config_file in ["ruff.toml", "pyproject.toml"]:
        config_path = Path(path) / config_file
        if config_path.is_file():
            return str(config_path)
    return None


# Check if the 'changed_files' input is enabled but no files were provided
if CHANGED_FILES_ENABLED and not CHANGED_FILES:
    print(
        "::error::'changed_files' input is enabled but no files were provided.",
        file=sys.stderr,
        flush=True,
    )
    sys.exit(0)

# Get the config path or isolated flag
config_args = []
config_path = get_config_path()

if USE_ISOLATED:
    config_args.append("--isolated")

if config_path is not None and not USE_ISOLATED:
    config_args.extend(["--config", config_path])

# Get the version specifier
version_specifier = determine_version()
req = f"ruff{version_specifier}"

# Install ruff
print(f"Installing {req}...", flush=True)
pip_proc = subprocess.run(
    args=["python", "-m", "pip", "install", req],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    cwd=ACTION_PATH,
    encoding="utf-8",
    check=False,
)
if pip_proc.returncode:
    print(pip_proc.stdout)
    print("::error::Failed to install 'ruff'.", file=sys.stderr, flush=True)
    sys.exit(pip_proc.returncode)

# Run ruff with the provided arguments
print(f"Running ruff with arguments: {ARGS}", flush=True)
proc = subprocess.run(
    args=[
        "ruff",
        *shlex.split(ARGS),
        *shlex.split(CHANGED_FILES or SRC),
        *config_args,
    ],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    cwd=ACTION_PATH,
    encoding="utf-8",
    check=False,
)

print(proc.stdout)
sys.exit(proc.returncode)
