#!/usr/bin/env python3
"""Sync root VERSION (X.Y.Z) into package.json files and OpenAPI info.version."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION_FILE = ROOT / "VERSION"
TARGETS = (
    ROOT / "backend" / "package.json",
    ROOT / "frontend" / "package.json",
    ROOT / "backend" / "schema" / "swagger.json",
)


def normalize(raw: str) -> str:
    version = raw.strip().lstrip("v")
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError(f"Invalid semver (expected X.Y.Z): {raw!r}")
    return version


def load_version(arg: str | None) -> str:
    if arg:
        return normalize(arg)
    if not VERSION_FILE.is_file():
        raise FileNotFoundError(f"Missing {VERSION_FILE}")
    return normalize(VERSION_FILE.read_text(encoding="utf-8"))


def update_json(path: Path, version: str) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    if path.name == "swagger.json":
        data.setdefault("info", {})["version"] = version
    else:
        data["version"] = version
    path.write_text(json.dumps(data, indent="\t") + "\n", encoding="utf-8")


def main() -> int:
    try:
        version = load_version(sys.argv[1] if len(sys.argv) > 1 else None)
    except (ValueError, FileNotFoundError) as exc:
        print(f"::error::{exc}", file=sys.stderr)
        return 1

    VERSION_FILE.write_text(f"{version}\n", encoding="utf-8")
    for path in TARGETS:
        update_json(path, version)

    print(f"Synced version {version} (image tags: v{version}, v{version.rsplit('.', 1)[0]}, v{version.split('.')[0]})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
