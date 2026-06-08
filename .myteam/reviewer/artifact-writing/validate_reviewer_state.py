#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


ALLOWED_ARTIFACTS = {"reviewer_report.md", "reviewer_result.json"}


def git_stdout(repo_root: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", "-C", str(repo_root), *args],
        check=True,
        capture_output=True,
        text=True,
    )
    # Strip only trailing newlines: `git status --short` lines are column-aligned
    # (XY + space + path), so a full strip() would eat the leading status column
    # of the first line and corrupt its parsed path (e.g. " M artifacts/x" ->
    # "M artifacts/x" -> path parsed as "rtifacts/x").
    return completed.stdout.rstrip("\n")


def changed_files(repo_root: Path) -> list[str]:
    output = git_stdout(repo_root, "status", "--short")
    files: list[str] = []
    for line in output.splitlines():
        if not line.strip():
            continue
        files.append(line[3:].strip())
    return files


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate final reviewer artifact state before commit.")
    parser.add_argument("--repo-root", default=".", help="Repository root or worktree root.")
    parser.add_argument("--artifact-dir", required=True, help="Artifact directory containing reviewer outputs.")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    artifact_dir = Path(args.artifact_dir)
    if not artifact_dir.is_absolute():
        artifact_dir = repo_root / artifact_dir
    artifact_dir = artifact_dir.resolve()

    required_paths = {str((artifact_dir / name).resolve()) for name in ALLOWED_ARTIFACTS}
    missing_files = [str(path.relative_to(repo_root)) for path in sorted(Path(path) for path in required_paths) if not path.exists()]

    repo_changes = changed_files(repo_root)
    unexpected_changes: list[str] = []
    for rel in repo_changes:
        abs_path = (repo_root / rel).resolve()
        if str(abs_path) not in required_paths:
            unexpected_changes.append(rel)

    result = {
        "artifact_dir": artifact_dir.relative_to(repo_root).as_posix() if artifact_dir.is_relative_to(repo_root) else artifact_dir.as_posix(),
        "missing_files": missing_files,
        "changed_files": repo_changes,
        "unexpected_changes": unexpected_changes,
        "valid": not missing_files and not unexpected_changes,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
