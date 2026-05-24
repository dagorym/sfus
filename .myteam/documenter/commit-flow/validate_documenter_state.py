#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


REQUIRED_ARTIFACTS = ("documenter_report.md", "documenter_result.json", "verifier_prompt.txt")


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


def is_artifact_path(path: str, artifact_dir: str | None) -> bool:
    return bool(artifact_dir and (path == artifact_dir or path.startswith(f"{artifact_dir}/")))


def is_documentation_path(path: str) -> bool:
    name = Path(path).name.lower()
    return path.startswith("docs/") or name.startswith("readme")


def load_result_json(repo_root: Path, artifact_dir: str | None) -> dict[str, object] | None:
    if not artifact_dir:
        return None
    path = repo_root / artifact_dir / "documenter_result.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate documenter scope and artifact state.")
    parser.add_argument("--repo-root", default=".", help="Repository root or worktree root.")
    parser.add_argument("--phase", choices=["docs", "artifacts"], required=True, help="Validation phase.")
    parser.add_argument("--artifact-dir", help="Repository-root-relative artifact directory.")
    parser.add_argument("--documentation-commit-hash", help="Expected documentation commit hash for artifact validation.")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    artifact_dir = args.artifact_dir.strip("/") if args.artifact_dir else None

    staged = changed_files(repo_root, "diff", "--cached", "--name-only")
    unstaged = changed_files(repo_root, "diff", "--name-only")
    untracked = changed_files(repo_root, "ls-files", "--others", "--exclude-standard")
    all_changed = sorted(set(staged + unstaged + untracked))

    invalid_paths: list[str] = []
    for path in all_changed:
        if args.phase == "docs":
            if not is_documentation_path(path):
                invalid_paths.append(path)
        else:
            if not is_artifact_path(path, artifact_dir):
                invalid_paths.append(path)

    missing_artifacts: list[str] = []
    result_json_hash = None
    if args.phase == "artifacts" and artifact_dir:
        artifact_root = repo_root / artifact_dir
        for name in REQUIRED_ARTIFACTS:
            if not (artifact_root / name).exists():
                missing_artifacts.append(name)
        result_payload = load_result_json(repo_root, artifact_dir)
        if isinstance(result_payload, dict):
            value = result_payload.get("documentation_commit_hash")
            result_json_hash = str(value) if value is not None else None

    hash_matches = True
    if args.phase == "artifacts" and args.documentation_commit_hash:
        hash_matches = result_json_hash == args.documentation_commit_hash

    result = {
        "phase": args.phase,
        "current_branch": git_stdout(repo_root, "branch", "--show-current"),
        "artifact_dir": artifact_dir,
        "staged_files": staged,
        "unstaged_files": unstaged,
        "untracked_files": untracked,
        "all_changed_files": all_changed,
        "invalid_paths": invalid_paths,
        "missing_required_artifacts": missing_artifacts,
        "expected_documentation_commit_hash": args.documentation_commit_hash,
        "result_json_documentation_commit_hash": result_json_hash,
        "documentation_commit_hash_matches": hash_matches,
    }
    print(json.dumps(result, indent=2, sort_keys=True))

    ok = not invalid_paths and not missing_artifacts and hash_matches
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
