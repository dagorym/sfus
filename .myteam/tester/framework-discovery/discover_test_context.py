#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


FRAMEWORK_MARKERS = [
    ("pytest", "pytest.ini", "pytest"),
    ("pytest", "pyproject.toml", "pytest"),
    ("jest", "jest.config.js", "npm test -- --runInBand"),
    ("jest", "jest.config.cjs", "npm test -- --runInBand"),
    ("jest", "jest.config.mjs", "npm test -- --runInBand"),
    ("jest", "jest.config.ts", "npm test -- --runInBand"),
    ("vitest", "vitest.config.js", "npx vitest run"),
    ("vitest", "vitest.config.ts", "npx vitest run"),
    ("cargo-test", "Cargo.toml", "cargo test"),
    ("go-test", "go.mod", "go test ./..."),
    ("maven-surefire", "pom.xml", "mvn test"),
    ("gradle-test", "build.gradle", "./gradlew test"),
    ("gradle-test", "build.gradle.kts", "./gradlew test"),
]

TEST_DIR_NAMES = {"tests", "test", "__tests__", "spec", "specs"}


def find_repo_root(start: Path) -> Path:
    current = start.resolve()
    for candidate in [current, *current.parents]:
        if (candidate / ".git").exists():
            return candidate
    return current


def relpath(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def gather_test_dirs(root: Path) -> list[str]:
    results: list[str] = []
    for dirpath, dirnames, _filenames in os.walk(root):
        dirnames[:] = [
            d for d in dirnames if d not in {".git", ".venv", "venv", "__pycache__", "node_modules", ".mypy_cache"}
        ]
        path = Path(dirpath)
        if path.name.lower() in TEST_DIR_NAMES:
            results.append(relpath(root, path))
    return sorted(dict.fromkeys(results))


def gather_framework_candidates(root: Path) -> list[dict[str, object]]:
    candidates: list[dict[str, object]] = []
    seen: set[tuple[str, str]] = set()
    for framework, marker, command in FRAMEWORK_MARKERS:
        path = root / marker
        if not path.exists():
            continue
        key = (framework, command)
        if key in seen:
            continue
        seen.add(key)
        candidates.append(
            {
                "framework": framework,
                "evidence": [marker],
                "suggested_command": command,
            }
        )
    return candidates


def main() -> int:
    parser = argparse.ArgumentParser(description="Gather generalizable repository evidence for tester framework discovery.")
    parser.add_argument("--repo-root", default=".", help="Repository root or starting directory.")
    args = parser.parse_args()

    repo_root = find_repo_root(Path(args.repo_root))
    workflows_dir = repo_root / ".github" / "workflows"
    workflow_files = []
    if workflows_dir.exists():
        workflow_files = sorted(relpath(repo_root, path) for path in workflows_dir.glob("*.y*ml"))

    result = {
        "repo_root": str(repo_root),
        "framework_candidates": gather_framework_candidates(repo_root),
        "likely_test_directories": gather_test_dirs(repo_root),
        "workflow_files": workflow_files,
        "assumption_note": (
            "Treat suggested commands and framework candidates as repository-evidence inputs. "
            "The tester agent should still choose the smallest meaningful command for the task."
        ),
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
