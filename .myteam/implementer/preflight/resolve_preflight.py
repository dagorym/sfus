#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path


SECTION_TITLES = [
    "Allowed files",
    "Task to implement",
    "Acceptance criteria",
    "Validation guidance",
    "Tester test-file location guidance",
    "Artifact guidance",
    "Startup behavior",
    "Completion gate",
]

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


def extract_artifact_path(artifact_guidance: str) -> str | None:
    match = ARTIFACT_PATH_RE.search(artifact_guidance)
    return match.group(1) if match else None


def main() -> int:
    parser = argparse.ArgumentParser(description="Resolve implementer preflight context from a planner prompt and repository evidence.")
    parser.add_argument("--input", help="Path to the implementer prompt text. Defaults to stdin.")
    parser.add_argument("--repo-root", default=".", help="Repository root or starting directory.")
    parser.add_argument("--limit", type=int, default=12, help="Maximum number of likely file matches to return.")
    args = parser.parse_args()

    text = load_text(args.input)
    repo_root = find_repo_root(Path(args.repo_root))

    task = extract_section(text, "Task to implement")
    allowed_files = parse_bullets(extract_section(text, "Allowed files"))
    acceptance_criteria = parse_bullets(extract_section(text, "Acceptance criteria"))
    validation_guidance = parse_bullets(extract_section(text, "Validation guidance"))
    tester_test_locations = parse_bullets(extract_section(text, "Tester test-file location guidance"))
    artifact_guidance = extract_section(text, "Artifact guidance")
    artifact_directory = extract_artifact_path(artifact_guidance)

    assumptions: list[str] = []
    query_tokens = tokenize_query(task)
    repo_matches = gather_keyword_matches(repo_root, query_tokens, args.limit)
    repo_validation_commands = gather_validation_commands(repo_root)
    likely_test_dirs = gather_named_dirs(repo_root, {"tests", "test", "__tests__"})

    if not validation_guidance and repo_validation_commands:
        validation_guidance = [
            f"{item['command']} (assumption from {item['source']})"
            for item in repo_validation_commands[:3]
        ]
        assumptions.append("Validation guidance inferred from repository conventions.")

    if not tester_test_locations and likely_test_dirs:
        tester_test_locations = [f"{path} (assumption from repository conventions)" for path in likely_test_dirs[:3]]
        assumptions.append("Tester test-file location guidance inferred from repository conventions.")

    result = {
        "task": task,
        "allowed_files": allowed_files,
        "acceptance_criteria": acceptance_criteria,
        "validation_guidance": validation_guidance,
        "tester_test_locations": tester_test_locations,
        "artifact_guidance": artifact_guidance,
        "artifact_directory": artifact_directory,
        "assumptions": assumptions,
        "repo_context": {
            "repo_root": str(repo_root),
            "query_tokens": query_tokens,
            "likely_files": repo_matches,
            "likely_test_dirs": likely_test_dirs,
            "validation_command_candidates": repo_validation_commands,
        },
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
