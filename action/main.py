"""GitHub Action for Ruff."""

import os
import re
import shlex
import sys
from pathlib import Path
from subprocess import run

ACTION_PATH = Path(os.environ["GITHUB_ACTION_PATH"])
ARGS = os.getenv("INPUT_ARGS", default="")
SRC = os.getenv("INPUT_SRC", default="")
VERSION = os.getenv("INPUT_VERSION", default="")
CHANGED_FILES = os.getenv("CHANGED_FILES", "")
IS_CHANGED_FILES_ENABLED = os.getenv("IS_CHANGED_FILES_ENABLED", default="false")

version_specifier = ""
if VERSION != "":
    if not re.match(r"v?\d\.\d{1,3}\.\d{1,3}$", VERSION):
        print("VERSION does not match expected pattern")
        sys.exit(1)
    version_specifier = f"=={VERSION}"

req = f"ruff{version_specifier}"

# If `CHANGED_FILES` is not empty, split it into a list; otherwise, use `SRC`.
files_to_check = shlex.split(CHANGED_FILES or SRC)

# If IS_CHANGED_FILES_ENABLED is true and CHANGED_FILES was empty, there were no files to check
# Short circuit to prevent ruff from running on all files because it got no file argument
if IS_CHANGED_FILES_ENABLED == "true" and not CHANGED_FILES:
    sys.exit(0)

proc = run(["pipx", "run", req, *shlex.split(ARGS), *files_to_check])

sys.exit(proc.returncode)
