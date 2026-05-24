#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path


SECTION_TITLES = [
    "Task summary",
    "Modified files",
    "Acceptance criteria to validate (from Planner)",
    "Create test files in",
    "Implementation context for testing",
    "Suggested test command(s)",
    "Existing validations expected to fail only because approved behavior changed",
    "Startup behavior",
    "Shared artifact directory",
    "Completion gate",
]

KNOWN_FRAMEWORKS = [
    {
        "framework": "pytest",
        "files": ["pytest.ini", "conftest.py"],
        "command": "pytest",
    },
    {
        "framework": "pytest",
        "files": ["pyproject.toml"],
        "contains": ["pytest", "tool.pytest.ini_options"],
        "command": "pytest",
    },
    {
        "framework": "unittest",
        "files": ["tests", "test"],
        "command": "python -m unittest",
    },
    {
        "framework": "jest",
        "files": ["jest.config.js", "jest.config.cjs", "jest.config.mjs", "jest.config.ts"],
        "command": "npm test -- --runInBand",
    },
    {
        "framework": "vitest",
        "files": ["vitest.config.js", "vitest.config.mjs", "vitest.config.ts"],
        "command": "npx vitest run",
    },
    {
        "framework": "cargo-test",
        "files": ["Cargo.toml"],
        "command": "cargo test",
    },
    {
        "framework": "go-test",
        "files": ["go.mod"],
        "command": "go test ./...",
    },
    {
        "framework": "maven-surefire",
        "files": ["pom.xml"],
        "command": "mvn test",
    },
    {
        "framework": "gradle-test",
        "files": ["build.gradle", "build.gradle.kts"],
        "command": "./gradlew test",
    },
]

TEST_DIR_NAMES = {"tests", "test", "__tests__", "spec", "specs"}
TEST_FILE_SUFFIXES = (
    "_test.py",
    "_spec.py",
    ".test.js",
    ".test.ts",
    ".spec.js",
    ".spec.ts",
    "Test.java",
    "Tests.java",
    "_test.go",
)
ARTIFACT_PATH_RE = re.compile(r"(artifacts/[A-Za-z0-9._/\-]+)")


def load_text(path: str | None) -> str:
    if path:
        return Path(path).read_text(encoding="utf-8")
    return sys.stdin.read()


def find_repo_root(start: Path) -> Path:
    current = start.resolve()
    for candidate in [current, *current.parents]:
        if (candidate / ".git").exists():
            return candidate
    return current


def extract_section(text: str, title: str) -> str:
    pattern = re.compile(
        rf"^{re.escape(title)}:\s*$\n(.*?)(?=^(?:{'|'.join(re.escape(item) for item in SECTION_TITLES)}):\s*$|\Z)",
        re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(text)
    return match.group(1).strip() if match else ""


def parse_bullets(section: str) -> list[str]:
    values: list[str] = []
    for line in section.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("- "):
            values.append(stripped[2:].strip())
        else:
            values.append(stripped)
    return values


def normalize_artifact_dir(value: str | None) -> str | None:
    if not value:
        return None
    match = ARTIFACT_PATH_RE.search(value)
    if match:
        return match.group(1).strip("/")
    stripped = value.strip().strip("/")
    return stripped or None


def derive_task_slug(task_summary: str) -> str:
    base = task_summary.strip().lower()
    base = re.sub(r"\b(implementer|tester|verifier)\b$", "", base).strip()
    base = re.sub(r"[^a-z0-9]+", "-", base)
    base = re.sub(r"-{2,}", "-", base).strip("-")
    return base or "task"


def relpath(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def gather_named_dirs(root: Path, names: set[str]) -> list[str]:
    results: list[str] = []
    for dirpath, dirnames, _filenames in os.walk(root):
        dirnames[:] = [
            d for d in dirnames if d not in {".git", ".venv", "venv", "__pycache__", "node_modules", ".mypy_cache"}
        ]
        path = Path(dirpath)
        if path.name.lower() in names:
            results.append(relpath(root, path))
    return sorted(dict.fromkeys(results))


def gather_test_files(root: Path, limit: int) -> list[str]:
    results: list[str] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [
            d for d in dirnames if d not in {".git", ".venv", "venv", "__pycache__", "node_modules", ".mypy_cache"}
        ]
        for name in filenames:
            lower = name.lower()
            if lower.endswith(TEST_FILE_SUFFIXES) or lower.startswith("test_"):
                results.append(relpath(root, Path(dirpath) / name))
                if len(results) >= limit:
                    return results
    return results


def framework_matches(root: Path) -> list[dict[str, object]]:
    matches: list[dict[str, object]] = []
    for candidate in KNOWN_FRAMEWORKS:
        matched_files: list[str] = []
        for value in candidate["files"]:
            path = root / value
            if path.exists():
                if path.is_file() and "contains" in candidate:
                    text = path.read_text(encoding="utf-8", errors="ignore")
                    if not any(needle in text for needle in candidate["contains"]):
                        continue
                matched_files.append(value)
        if matched_files:
            matches.append(
                {
                    "framework": candidate["framework"],
                    "evidence": matched_files,
                    "suggested_command": candidate["command"],
                }
            )
    return matches


def main() -> int:
    parser = argparse.ArgumentParser(description="Resolve tester preflight context from prompt text and repository evidence.")
    parser.add_argument("--input", help="Path to the tester handoff prompt. Defaults to stdin.")
    parser.add_argument("--repo-root", default=".", help="Repository root or starting directory.")
    parser.add_argument("--limit", type=int, default=20, help="Maximum number of sample test files to return.")
    args = parser.parse_args()

    text = load_text(args.input)
    repo_root = find_repo_root(Path(args.repo_root))

    task_summary = parse_bullets(extract_section(text, "Task summary"))
    modified_files = parse_bullets(extract_section(text, "Modified files"))
    acceptance_criteria = parse_bullets(extract_section(text, "Acceptance criteria to validate (from Planner)"))
    test_location_guidance = parse_bullets(extract_section(text, "Create test files in"))
    implementation_context = parse_bullets(extract_section(text, "Implementation context for testing"))
    suggested_commands = parse_bullets(extract_section(text, "Suggested test command(s)"))
    expected_validation_failures = parse_bullets(
        extract_section(text, "Existing validations expected to fail only because approved behavior changed")
    )
    shared_artifact_directory = normalize_artifact_dir(extract_section(text, "Shared artifact directory"))

    assumptions: list[str] = []
    if not shared_artifact_directory:
        derived_slug = derive_task_slug(task_summary[0] if task_summary else "task")
        shared_artifact_directory = f"artifacts/{derived_slug}"
        assumptions.append("Shared artifact directory inferred from task summary.")

    likely_test_dirs = gather_named_dirs(repo_root, TEST_DIR_NAMES)
    sample_test_files = gather_test_files(repo_root, args.limit)
    framework_candidates = framework_matches(repo_root)
    command_candidates = [item["suggested_command"] for item in framework_candidates]

    if not test_location_guidance and likely_test_dirs:
        test_location_guidance = [f"{path} (assumption from repository conventions)" for path in likely_test_dirs[:3]]
        assumptions.append("Test file location guidance inferred from repository conventions.")

    if not suggested_commands and command_candidates:
        suggested_commands = [f"{value} (assumption from repository evidence)" for value in command_candidates[:3]]
        assumptions.append("Test command guidance inferred from repository evidence.")

    result = {
        "task_summary": task_summary,
        "modified_files": modified_files,
        "acceptance_criteria": acceptance_criteria,
        "implementation_context": implementation_context,
        "expected_validation_failures": expected_validation_failures,
        "test_location_guidance": test_location_guidance,
        "shared_artifact_directory": shared_artifact_directory,
        "suggested_commands": suggested_commands,
        "assumptions": assumptions,
        "repository_evidence": {
            "repo_root": str(repo_root),
            "framework_candidates": framework_candidates,
            "likely_test_directories": likely_test_dirs,
            "sample_test_files": sample_test_files,
        },
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
