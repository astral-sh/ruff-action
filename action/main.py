"""GitHub Action for Ruff."""

import os
import re
import shlex
import sys
from pathlib import Path
from subprocess import run

ACTION_PATH = Path(os.environ["GITHUB_ACTION_PATH"])
ARGS = os.getenv("INPUT_ARGS", default="")
MODE = os.getenv("INPUT_MODE", default="")
SRC = os.getenv("INPUT_SRC", default="")
VERSION = os.getenv("INPUT_VERSION", default="")

version_specifier = ""
if VERSION != "":
    if not re.match(r"v?\d\.\d{1,3}\.\d{1,3}$", VERSION):
        print("VERSION does not match expected pattern")
        sys.exit(1)
    version_specifier = f"=={VERSION}"

req = f"ruff{version_specifier}"

command = (
    ["pipx", "run", req, MODE, *shlex.split(ARGS), *shlex.split(SRC)]
    if MODE == "check"
    else [
        "pipx",
        "run",
        req,
        MODE,
        "--check",
        *shlex.split(ARGS),
        *shlex.split(SRC),
    ]
)

proc = run(command)

sys.exit(proc.returncode)
