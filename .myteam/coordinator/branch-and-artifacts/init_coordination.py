#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "plan"


def current_branch(repo_root: Path) -> str:
    completed = subprocess.run(
        ["git", "-C", str(repo_root), "branch", "--show-current"],
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def ensure_dirs(paths: list[Path]) -> None:
    for path in paths:
        path.mkdir(parents=True, exist_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Initialize coordinator branch and artifact layout.")
    parser.add_argument("plan_identifier", help="Plan title or stable identifier.")
    parser.add_argument("--repo-root", default=".", help="Repository root.")
    parser.add_argument("--artifact-root", default="artifacts", help="Repository-root-relative artifact root.")
    parser.add_argument("--subtask", action="append", default=[], help="Subtask identifier to initialize.")
    parser.add_argument("--create-dirs", action="store_true", help="Create the artifact directories.")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    branch = current_branch(repo_root)
    plan_slug = slugify(args.plan_identifier)

    if branch not in {"main", "master"}:
        coordination_branch = branch
        branch_action = "reuse-current-branch"
    else:
        coordination_branch = f"coord-{plan_slug}"
        branch_action = "create-and-checkout-required"

    artifact_root = Path(args.artifact_root)
    plan_dir = repo_root / artifact_root / plan_slug
    subtask_dirs = {
        subtask: (plan_dir / slugify(subtask)).relative_to(repo_root).as_posix()
        for subtask in args.subtask
    }
    subtask_history_dirs = {
        subtask: (plan_dir / slugify(subtask) / "history").relative_to(repo_root).as_posix()
        for subtask in args.subtask
    }

    if args.create_dirs:
        ensure_dirs(
            [
                plan_dir,
                *[repo_root / rel for rel in subtask_dirs.values()],
                *[repo_root / rel for rel in subtask_history_dirs.values()],
            ]
        )

    result = {
        "current_branch": branch,
        "coordination_branch": coordination_branch,
        "branch_action": branch_action,
        "artifact_root": artifact_root.as_posix(),
        "plan_directory": plan_dir.relative_to(repo_root).as_posix(),
        "subtask_directories": subtask_dirs,
        "subtask_history_directories": subtask_history_dirs,
        "reviewer_directory": plan_dir.relative_to(repo_root).as_posix(),
        "directories_created": args.create_dirs,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
