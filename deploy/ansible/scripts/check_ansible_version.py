#!/usr/bin/env python3
"""Exit 0 if ansible-playbook is ansible-core 2.17+, else 1."""
from __future__ import annotations

import re
import subprocess
import sys

_MIN_MAJOR = 2
_MIN_MINOR = 17

_VERSION_PATTERNS = (
    r"ansible\[core\s+([0-9]+\.[0-9]+\.[0-9]+)\]",
    r"ansible-core\s+([0-9]+\.[0-9]+\.[0-9]+)",
    r"ansible-playbook\s+([0-9]+\.[0-9]+\.[0-9]+)",
)


def parse_ansible_version(version_output: str) -> str:
    for pattern in _VERSION_PATTERNS:
        match = re.search(pattern, version_output)
        if match:
            return match.group(1)
    return ""


def version_ok(version: str) -> bool:
    if not version:
        return False
    parts = [int(x) for x in version.split(".")[:3]]
    if len(parts) < 2:
        return False
    return (parts[0], parts[1]) >= (_MIN_MAJOR, _MIN_MINOR)


def main() -> int:
    try:
        out = subprocess.check_output(
            ["ansible-playbook", "--version"],
            text=True,
            stderr=subprocess.STDOUT,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("::error::ansible-playbook not found or failed", file=sys.stderr)
        return 1

    ver = parse_ansible_version(out)
    if version_ok(ver):
        return 0

    print(
        f"::error::ansible-core {_MIN_MAJOR}.{_MIN_MINOR}+ required, found {ver or 'unknown'}",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
