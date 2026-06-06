#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def fail(message: str) -> None:
    print(f"Error: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Archive live stage artifacts into history/<pass-label>/ before a "
            "remediation cycle and commit the archival on the current branch. "
            "Run from the failing stage worktree root."
        )
    )
    parser.add_argument("artifact_dir")
    parser.add_argument("history_dir")
    parser.add_argument("pass_label")
    parser.add_argument("files", nargs="*", help="Specific live artifact files to archive.")
    parser.add_argument(
        "--all",
        action="store_true",
        help="Archive every live artifact except the history directory.",
    )
    parser.add_argument(
        "--no-commit",
        action="store_true",
        help="Skip the git commit; the caller must commit before merge-back.",
    )
    args = parser.parse_args()

    if not args.files and not args.all:
        fail("nothing to archive: pass explicit files or --all")

    artifact_dir = Path(args.artifact_dir)
    history_dir = Path(args.history_dir)
    if not artifact_dir.is_dir():
        fail(f"artifact directory not found: {artifact_dir}")
    history_root = history_dir / args.pass_label
    history_root.mkdir(parents=True, exist_ok=True)

    if args.all:
        names = sorted(
            p.name for p in artifact_dir.iterdir()
            if p.resolve() != history_dir.resolve()
        )
    else:
        names = args.files

    moved = []
    for name in names:
        source = artifact_dir / name
        if not source.exists():
            continue
        destination = history_root / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(destination))
        moved.append(name)
        print(f"Archived {source} -> {destination}")

    if not moved:
        fail(f"no live artifacts found to archive in {artifact_dir}")

    if not args.no_commit:
        for cmd in (
            ["git", "add", "-A", "--", str(artifact_dir), str(history_dir)],
            ["git", "commit", "-m", f"Archive {args.pass_label} stage artifacts for remediation"],
        ):
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                fail(f"{' '.join(cmd)} failed: {result.stderr.strip() or result.stdout.strip()}")
        print(f"Committed archival of {len(moved)} artifact file(s) under {history_root}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
