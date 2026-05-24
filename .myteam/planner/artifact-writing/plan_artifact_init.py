#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def find_repo_root(start: Path) -> Path:
    current = start.resolve()
    for candidate in [current, *current.parents]:
        if (candidate / ".git").exists():
            return candidate
    return current


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "plan"


def choose_unique_path(directory: Path, stem: str) -> Path:
    candidate = directory / f"{stem}-plan.md"
    index = 2
    while candidate.exists():
        candidate = directory / f"{stem}-plan-{index}.md"
        index += 1
    return candidate


def main() -> int:
    parser = argparse.ArgumentParser(description="Initialize planner artifact path and optional skeleton.")
    parser.add_argument("feature_title", help="Feature title used for slug generation.")
    parser.add_argument("--output-dir", help="Optional output directory relative to repo root.")
    parser.add_argument("--root", default=".", help="Repository root or starting directory.")
    parser.add_argument("--write-skeleton", action="store_true", help="Write an initial markdown skeleton file.")
    args = parser.parse_args()

    root = find_repo_root(Path(args.root))
    output_dir = root / (args.output_dir or "plans")
    output_dir.mkdir(parents=True, exist_ok=True)

    slug = slugify(args.feature_title)
    artifact_path = choose_unique_path(output_dir, slug)
    rel_artifact = artifact_path.relative_to(root).as_posix()

    skeleton = "\n".join(
        [
            f"# {args.feature_title}",
            "",
            "## Files To Modify",
            "",
            "## Documentation Impact",
            "",
            "## Subtasks",
            "",
            "## Dependency Ordering",
            "",
            "## Implementer Prompts",
            "",
            "## Output Artifact Path",
            rel_artifact,
            "",
        ]
    )

    if args.write_skeleton:
        artifact_path.write_text(skeleton, encoding="utf-8")

    result = {
        "repo_root": str(root),
        "feature_title": args.feature_title,
        "slug": slug,
        "output_dir": output_dir.relative_to(root).as_posix(),
        "artifact_path": rel_artifact,
        "skeleton_written": args.write_skeleton,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
