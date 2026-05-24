#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


def git_stdout(repo_root: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", "-C", str(repo_root), *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def changed_files(repo_root: Path, *args: str) -> list[str]:
    output = git_stdout(repo_root, *args)
    return [line.strip() for line in output.splitlines() if line.strip()]


def is_in_scope(path: str, allowed_files: set[str], artifact_dir: str | None) -> bool:
    if path in allowed_files:
        return True
    if artifact_dir and (path == artifact_dir or path.startswith(f"{artifact_dir}/")):
        return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate that implementer changes stay within approved scope.")
    parser.add_argument("--repo-root", default=".", help="Repository root or worktree root.")
    parser.add_argument("--artifact-dir", help="Repository-root-relative artifact directory to exempt from scope checks.")
    parser.add_argument("--allowed-file", action="append", default=[], help="Approved file path. May be repeated.")
    parser.add_argument("--require-artifact", action="append", default=[], help="Artifact file name expected under the artifact directory.")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    artifact_dir = args.artifact_dir.strip("/") if args.artifact_dir else None
    allowed_files = {item.strip() for item in args.allowed_file if item.strip()}

    staged = changed_files(repo_root, "diff", "--cached", "--name-only")
    unstaged = changed_files(repo_root, "diff", "--name-only")
    untracked = changed_files(repo_root, "ls-files", "--others", "--exclude-standard")
    all_changed = sorted(set(staged + unstaged + untracked))

    out_of_scope = [path for path in all_changed if not is_in_scope(path, allowed_files, artifact_dir)]
    missing_artifacts: list[str] = []

    if artifact_dir:
        artifact_root = repo_root / artifact_dir
        for artifact_name in args.require_artifact:
            artifact_path = artifact_root / artifact_name
            if not artifact_path.exists():
                missing_artifacts.append(artifact_name)

    result = {
        "current_branch": git_stdout(repo_root, "branch", "--show-current"),
        "allowed_files": sorted(allowed_files),
        "artifact_dir": artifact_dir,
        "staged_files": staged,
        "unstaged_files": unstaged,
        "untracked_files": untracked,
        "all_changed_files": all_changed,
        "out_of_scope_files": out_of_scope,
        "missing_required_artifacts": missing_artifacts,
        "in_scope": not out_of_scope,
        "artifacts_ready": not missing_artifacts,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["in_scope"] and result["artifacts_ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
