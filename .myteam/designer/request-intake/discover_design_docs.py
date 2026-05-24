#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


SKIP_DIRS = {
    ".git",
    ".venv",
    "venv",
    "__pycache__",
    "node_modules",
    ".mypy_cache",
    ".pytest_cache",
    "deprecated",
    "archive",
    "archives",
}
PRIORITY_FILES = {"README.md", "DESIGN.md", "SPEC.md", "ARCHITECTURE.md"}
DESIGN_HINTS = (
    "design",
    "spec",
    "architecture",
    "arch",
    "adr",
    "proposal",
    "overview",
    "requirements",
    "system",
    "product",
)
EXCLUDE_HINTS = ("changelog", "release-notes", "license", "contributing", "code-of-conduct")


def find_repo_root(start: Path) -> Path:
    current = start.resolve()
    for candidate in [current, *current.parents]:
        if (candidate / ".git").exists():
            return candidate
    return current


def relpath(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def tokenize_query(values: list[str]) -> list[str]:
    tokens: list[str] = []
    for value in values:
        for part in value.lower().replace("/", " ").replace("_", " ").replace("-", " ").split():
            if len(part) >= 3:
                tokens.append(part)
    return list(dict.fromkeys(tokens))


def markdown_candidates(repo_root: Path, include_hidden: bool) -> list[Path]:
    results: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(repo_root):
        dirnames[:] = [value for value in dirnames if value not in SKIP_DIRS]
        if not include_hidden:
            dirnames[:] = [value for value in dirnames if not value.startswith(".")]
        for filename in filenames:
            if not filename.lower().endswith(".md"):
                continue
            if not include_hidden and filename.startswith("."):
                continue
            results.append(Path(dirpath) / filename)
    return results


def score_candidate(repo_root: Path, path: Path, query_tokens: list[str]) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    rel = relpath(repo_root, path)
    lower = rel.lower()
    name = path.name

    if name in PRIORITY_FILES:
        score += 5
        reasons.append("priority design-oriented filename")
    if rel.count("/") == 0:
        score += 3
        reasons.append("top-level markdown document")
    if lower.startswith("docs/"):
        score += 2
        reasons.append("documentation directory")

    hint_matches = [hint for hint in DESIGN_HINTS if hint in lower]
    if hint_matches:
        score += 2 + min(3, len(hint_matches))
        reasons.append("design/spec-oriented path terms")

    exclude_matches = [hint for hint in EXCLUDE_HINTS if hint in lower]
    if exclude_matches:
        score -= 4
        reasons.append("likely non-design administrative document")

    overlap = sum(1 for token in query_tokens if token in lower)
    if overlap:
        score += overlap * 2
        reasons.append("path overlaps request terms")

    return score, reasons


def classify_candidate(repo_root: Path, path: Path) -> str:
    rel = relpath(repo_root, path).lower()
    if any(hint in rel for hint in ("adr", "architecture", "arch")):
        return "architecture"
    if "spec" in rel or "requirement" in rel:
        return "spec"
    if "proposal" in rel:
        return "proposal"
    if "design" in rel:
        return "design"
    return "documentation"


def main() -> int:
    parser = argparse.ArgumentParser(description="Rank likely in-scope design or spec documents from repository evidence.")
    parser.add_argument("--repo-root", default=".", help="Repository root or starting directory.")
    parser.add_argument("--query", action="append", default=[], help="Request text or scope hint used to rank relevant documents.")
    parser.add_argument("--limit", type=int, default=15, help="Maximum number of candidates to return.")
    parser.add_argument("--include-hidden", action="store_true", help="Include markdown files under hidden directories such as .github or .myteam.")
    args = parser.parse_args()

    repo_root = find_repo_root(Path(args.repo_root))
    query_tokens = tokenize_query(args.query)
    ranked: list[dict[str, object]] = []

    for path in markdown_candidates(repo_root, args.include_hidden):
        score, reasons = score_candidate(repo_root, path, query_tokens)
        if score <= 0:
            continue
        ranked.append(
            {
                "path": relpath(repo_root, path),
                "score": score,
                "document_kind": classify_candidate(repo_root, path),
                "reasons": reasons,
            }
        )

    ranked.sort(key=lambda item: (-int(item["score"]), str(item["path"])))

    result = {
        "repo_root": str(repo_root),
        "query_tokens": query_tokens,
        "ranked_candidates": ranked[: args.limit],
        "assumption_note": "Candidate ranking is heuristic. Final in-scope document selection still depends on the user's requested design change.",
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
