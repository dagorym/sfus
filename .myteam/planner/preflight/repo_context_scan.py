#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


KNOWN_COMMANDS = [
    ("pytest.ini", "pytest", 0.95),
    ("pyproject.toml", "pytest", 0.75),
    ("package.json", "npm test", 0.75),
    ("Cargo.toml", "cargo test", 0.95),
    ("go.mod", "go test ./...", 0.9),
    ("pom.xml", "mvn test", 0.85),
    ("build.gradle", "./gradlew test", 0.85),
    ("build.gradle.kts", "./gradlew test", 0.85),
    ("Makefile", "make test", 0.65),
]


def find_repo_root(start: Path) -> Path:
    current = start.resolve()
    for candidate in [current, *current.parents]:
        if (candidate / ".git").exists():
            return candidate
    return current


def tokenize_query(text: str) -> list[str]:
    tokens: list[str] = []
    for raw in text.lower().replace("/", " ").replace("_", " ").replace("-", " ").split():
        token = raw.strip()
        if len(token) >= 3:
            tokens.append(token)
    return list(dict.fromkeys(tokens))


def relpath(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def score_path(path: Path, tokens: list[str]) -> int:
    haystack = path.as_posix().lower()
    return sum(1 for token in tokens if token in haystack)


def gather_named_dirs(root: Path, names: set[str]) -> list[str]:
    results: list[str] = []
    for dirpath, dirnames, _filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in {".git", ".venv", "venv", "__pycache__", "node_modules"}]
        path = Path(dirpath)
        if path.name.lower() in names:
            results.append(relpath(root, path))
    return sorted(dict.fromkeys(results))


def gather_keyword_matches(root: Path, tokens: list[str], limit: int) -> list[dict[str, object]]:
    if not tokens:
        return []

    candidates: list[tuple[int, Path]] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in {".git", ".venv", "venv", "__pycache__", "node_modules"}]
        for name in filenames:
            path = Path(dirpath) / name
            score = score_path(path.relative_to(root), tokens)
            if score > 0:
                candidates.append((score, path))

    ranked = sorted(candidates, key=lambda item: (-item[0], len(item[1].as_posix()), item[1].as_posix()))
    return [
        {
            "path": relpath(root, path),
            "score": score,
            "confidence": "high" if score >= max(2, min(3, len(tokens))) else "medium",
        }
        for score, path in ranked[:limit]
    ]


def gather_validation_commands(root: Path) -> list[dict[str, object]]:
    commands: list[dict[str, object]] = []
    for filename, command, confidence in KNOWN_COMMANDS:
        path = root / filename
        if path.exists():
            commands.append(
                {
                    "command": command,
                    "source": filename,
                    "confidence": confidence,
                }
            )
    workflows = list((root / ".github" / "workflows").glob("*.yml")) + list((root / ".github" / "workflows").glob("*.yaml"))
    if workflows:
        commands.append(
            {
                "command": "inspect .github/workflows for project-specific test commands",
                "source": ".github/workflows",
                "confidence": 0.6,
            }
        )
    return commands


def main() -> int:
    parser = argparse.ArgumentParser(description="Summarize repository context for planner preflight.")
    parser.add_argument("query", nargs="*", help="Feature summary or keywords to match against repo paths.")
    parser.add_argument("--root", default=".", help="Repository root or starting directory. Defaults to current directory.")
    parser.add_argument("--limit", type=int, default=12, help="Maximum number of keyword-matched files to return.")
    args = parser.parse_args()

    start = Path(args.root)
    root = find_repo_root(start)
    query_text = " ".join(args.query).strip()
    tokens = tokenize_query(query_text)

    result = {
        "repo_root": str(root),
        "query": query_text,
        "query_tokens": tokens,
        "likely_files": gather_keyword_matches(root, tokens, args.limit),
        "likely_test_dirs": gather_named_dirs(root, {"tests", "test", "__tests__"}),
        "likely_docs_dirs": gather_named_dirs(root, {"docs", "doc", "documentation"}),
        "validation_commands": gather_validation_commands(root),
        "plan_directories": [path for path in gather_named_dirs(root, {"plans"}) if path == "plans" or path.startswith("plans/")],
        "assumption_note": "Treat heuristic matches and inferred commands as assumptions unless corroborated by stronger repository evidence.",
    }

    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
