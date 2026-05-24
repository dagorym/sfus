#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


REQUIRED_FILES = {
    "implementer": ["implementer_report.md", "implementer_result.json", "tester_prompt.txt"],
    "tester": ["tester_report.md", "tester_result.json"],
    "documenter": ["documenter_report.md", "documenter_result.json", "verifier_prompt.txt"],
    "verifier": ["verifier_report.md", "verifier_result.json"],
    "reviewer": ["reviewer_report.md", "reviewer_result.json"],
}

OPTIONAL_HANDOFF_FILES = {
    "tester": "documenter_prompt.txt",
}

NEXT_PROMPT_FILES = {
    "implementer": "tester_prompt.txt",
    "tester": "documenter_prompt.txt",
    "documenter": "verifier_prompt.txt",
}


def git_stdout(repo_root: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", "-C", str(repo_root), *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def check_clean(repo_root: Path) -> bool:
    return git_stdout(repo_root, "status", "--short").strip() == ""


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate coordinator stage outputs and cleanliness.")
    parser.add_argument("stage", choices=sorted(REQUIRED_FILES), help="Workflow stage to validate.")
    parser.add_argument("artifact_dir", help="Artifact directory path.")
    parser.add_argument("--repo-root", default=".", help="Repository root or worktree root.")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    artifact_dir = Path(args.artifact_dir)
    if not artifact_dir.is_absolute():
        artifact_dir = repo_root / artifact_dir

    required = REQUIRED_FILES[args.stage]
    optional = OPTIONAL_HANDOFF_FILES.get(args.stage)
    existing = {name: (artifact_dir / name).exists() for name in required}
    optional_exists = (artifact_dir / optional).exists() if optional else None
    current_branch = git_stdout(repo_root, "branch", "--show-current")

    result = {
        "stage": args.stage,
        "artifact_dir": artifact_dir.relative_to(repo_root).as_posix() if artifact_dir.is_relative_to(repo_root) else artifact_dir.as_posix(),
        "current_branch": current_branch,
        "branch_clean": check_clean(repo_root),
        "required_files": existing,
        "missing_required_files": [name for name, present in existing.items() if not present],
        "optional_handoff_file": optional,
        "optional_handoff_exists": optional_exists,
        "next_prompt_path": None,
    }

    next_prompt = NEXT_PROMPT_FILES.get(args.stage)
    if next_prompt and (artifact_dir / next_prompt).exists():
        result["next_prompt_path"] = (
            (artifact_dir / next_prompt).relative_to(repo_root).as_posix()
            if (artifact_dir / next_prompt).is_relative_to(repo_root)
            else (artifact_dir / next_prompt).as_posix()
        )

    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if not result["missing_required_files"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
