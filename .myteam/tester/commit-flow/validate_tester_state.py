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


def is_in_scope(path: str, exact_files: set[str], prefixes: list[str], artifact_dir: str | None) -> bool:
    if path in exact_files:
        return True
    if any(path == prefix or path.startswith(f"{prefix.rstrip('/')}/") for prefix in prefixes):
        return True
    if artifact_dir and (path == artifact_dir or path.startswith(f"{artifact_dir}/")):
        return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate tester artifact/state expectations before final reporting or commit.")
    parser.add_argument("--repo-root", default=".", help="Repository root or worktree root.")
    parser.add_argument("--artifact-dir", help="Repository-root-relative artifact directory.")
    parser.add_argument("--allowed-test-file", action="append", default=[], help="Allowed exact test file path.")
    parser.add_argument("--allowed-test-prefix", action="append", default=[], help="Allowed test directory prefix.")
    parser.add_argument("--required-artifact", action="append", default=[], help="Artifact file required under the artifact directory.")
    parser.add_argument("--optional-artifact", action="append", default=[], help="Artifact file that may or may not exist.")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    artifact_dir = args.artifact_dir.strip("/") if args.artifact_dir else None
    exact_files = {item.strip() for item in args.allowed_test_file if item.strip()}
    prefixes = [item.strip().strip("/") for item in args.allowed_test_prefix if item.strip()]

    staged = changed_files(repo_root, "diff", "--cached", "--name-only")
    unstaged = changed_files(repo_root, "diff", "--name-only")
    untracked = changed_files(repo_root, "ls-files", "--others", "--exclude-standard")
    all_changed = sorted(set(staged + unstaged + untracked))

    out_of_scope = [path for path in all_changed if not is_in_scope(path, exact_files, prefixes, artifact_dir)]
    missing_required: list[str] = []
    optional_presence: dict[str, bool] = {}
    tester_result_summary = None

    if artifact_dir:
        artifact_root = repo_root / artifact_dir
        for name in args.required_artifact:
            if not (artifact_root / name).exists():
                missing_required.append(name)
        for name in args.optional_artifact:
            optional_presence[name] = (artifact_root / name).exists()
        result_path = artifact_root / "tester_result.json"
        if result_path.exists():
            try:
                data = json.loads(result_path.read_text(encoding="utf-8"))
                tester_result_summary = {
                    "status": data.get("status"),
                    "test_commit_hash": data.get("test_commit_hash"),
                    "artifact_file_paths": data.get("artifact_file_paths"),
                }
            except json.JSONDecodeError:
                tester_result_summary = {"error": "tester_result.json is not valid JSON"}

    result = {
        "current_branch": git_stdout(repo_root, "branch", "--show-current"),
        "artifact_dir": artifact_dir,
        "allowed_test_files": sorted(exact_files),
        "allowed_test_prefixes": prefixes,
        "staged_files": staged,
        "unstaged_files": unstaged,
        "untracked_files": untracked,
        "all_changed_files": all_changed,
        "out_of_scope_files": out_of_scope,
        "missing_required_artifacts": missing_required,
        "optional_artifacts": optional_presence,
        "branch_clean": git_stdout(repo_root, "status", "--short") == "",
        "tester_result_summary": tester_result_summary,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if not out_of_scope and not missing_required else 1


if __name__ == "__main__":
    raise SystemExit(main())
