#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


TOP_LEVEL_PRIORITY = [
    "AGENTS.md",
    "CLAUDE.md",
    "CONTRIBUTING.md",
    "README.md",
    "STYLE.md",
    "GUIDELINES.md",
]
KEYWORDS = ("contrib", "style", "guide", "guideline", "policy", "convention", "standards")
SKIP_DIRS = {".git", ".venv", "venv", "__pycache__", "node_modules", ".mypy_cache"}


def find_repo_root(start: Path) -> Path:
    current = start.resolve()
    for candidate in [current, *current.parents]:
        if (candidate / ".git").exists():
            return candidate
    return current


def relpath(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def tokenize_paths(paths: list[str]) -> list[str]:
    tokens: list[str] = []
    for value in paths:
        for part in value.lower().replace("/", " ").replace("_", " ").replace("-", " ").split():
            if len(part) >= 3:
                tokens.append(part)
    return list(dict.fromkeys(tokens))


def candidate_files(repo_root: Path) -> list[Path]:
    results: list[Path] = []
    for name in TOP_LEVEL_PRIORITY:
        path = repo_root / name
        if path.exists():
            results.append(path)
    myteam_root = repo_root / ".myteam"
    if myteam_root.exists():
        for path in myteam_root.rglob("*.md"):
            results.append(path)
    for dirpath, dirnames, filenames in os.walk(repo_root):
        dirnames[:] = [value for value in dirnames if value not in SKIP_DIRS]
        for filename in filenames:
            lower = filename.lower()
            if not lower.endswith(".md"):
                continue
            if any(keyword in lower for keyword in KEYWORDS):
                results.append(Path(dirpath) / filename)
    return list(dict.fromkeys(results))


def score_candidate(repo_root: Path, path: Path, changed_tokens: list[str]) -> tuple[int, list[str]]:
    reasons: list[str] = []
    score = 0
    rel = relpath(repo_root, path)
    lower = rel.lower()
    if path.name in {"AGENTS.md", "CLAUDE.md"}:
        score += 10
        reasons.append("top-level instruction file")
    if rel.startswith(".myteam/"):
        score += 8
        reasons.append("active myteam instruction file")
    if any(keyword in lower for keyword in KEYWORDS):
        score += 4
        reasons.append("convention-oriented filename")
    overlap = sum(1 for token in changed_tokens if token in lower)
    if overlap:
        score += overlap
        reasons.append("path overlaps changed-file tokens")
    if rel.startswith("docs/"):
        score += 1
        reasons.append("documentation path")
    return score, reasons


def main() -> int:
    parser = argparse.ArgumentParser(description="Rank likely convention files for verifier review.")
    parser.add_argument("--repo-root", default=".", help="Repository root or starting directory.")
    parser.add_argument("--changed-file", action="append", default=[], help="Changed file path to use as ranking context.")
    parser.add_argument("--limit", type=int, default=15, help="Maximum number of ranked candidates to return.")
    args = parser.parse_args()

    repo_root = find_repo_root(Path(args.repo_root))
    changed_tokens = tokenize_paths(args.changed_file)
    ranked: list[dict[str, object]] = []
    for path in candidate_files(repo_root):
        score, reasons = score_candidate(repo_root, path, changed_tokens)
        ranked.append(
            {
                "path": relpath(repo_root, path),
                "score": score,
                "reasons": reasons,
            }
        )
    ranked.sort(key=lambda item: (-int(item["score"]), str(item["path"])))

    result = {
        "repo_root": str(repo_root),
        "changed_files": args.changed_file,
        "ranked_candidates": ranked[: args.limit],
        "assumption_note": "Treat ranked convention files as evidence candidates; final applicability still depends on the changed behavior under review.",
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
