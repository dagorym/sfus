#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


CANDIDATE_DOCS = [
    "AGENTS.md",
    "AGENTS_LOOKUP.md",
    "README.md",
]


def find_repo_root(start: Path) -> Path:
    current = start.resolve()
    for candidate in [current, *current.parents]:
        if (candidate / ".git").exists():
            return candidate
    return current


def main() -> int:
    parser = argparse.ArgumentParser(description="Scan repo-level documentation for likely impact from a myteam node change.")
    parser.add_argument("--target", required=True, help="Slash-delimited myteam node path.")
    parser.add_argument("--root", default=".", help="Repository root or starting path.")
    args = parser.parse_args()

    repo_root = find_repo_root(Path(args.root))
    target = args.target
    leaf = target.split("/")[-1]
    hits: list[dict[str, object]] = []

    for relpath in CANDIDATE_DOCS:
        path = repo_root / relpath
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        matched_terms = [term for term in [target, leaf] if term and term in text]
        if matched_terms:
            hits.append(
                {
                    "path": relpath,
                    "matched_terms": matched_terms,
                }
            )

    result = {
        "target": target,
        "repo_root": str(repo_root),
        "candidate_docs": hits,
        "note": "Matched references are heuristics. Propose documentation edits only when the changed behavior affects repo-level guidance.",
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
