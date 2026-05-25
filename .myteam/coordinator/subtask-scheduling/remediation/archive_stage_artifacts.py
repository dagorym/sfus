#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Archive live stage artifacts before remediation.")
    parser.add_argument("artifact_dir")
    parser.add_argument("history_dir")
    parser.add_argument("pass_label")
    parser.add_argument("files", nargs="+")
    args = parser.parse_args()

    artifact_dir = Path(args.artifact_dir)
    history_root = Path(args.history_dir) / args.pass_label
    history_root.mkdir(parents=True, exist_ok=True)

    for name in args.files:
        source = artifact_dir / name
        if not source.exists():
            continue
        destination = history_root / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(destination))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
