#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


ROLE_RESULT_FILES = {
    "implementer": "implementer_result.json",
    "tester": "tester_result.json",
    "documenter": "documenter_result.json",
    "verifier": "verifier_result.json",
}


def relpath(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def categorize(path: str) -> str:
    name = Path(path).name.lower()
    if path == "AGENTS.md" or path == "CLAUDE.md" or path.startswith(".myteam/"):
        return "guidance"
    if path.startswith("docs/") or name.startswith("readme"):
        return "documentation"
    if (
        path.startswith("tests/")
        or "/tests/" in path
        or "/test/" in path
        or name.startswith("test_")
        or name.endswith(("_test.py", ".test.js", ".test.ts", ".spec.js", ".spec.ts", "_test.go"))
    ):
        return "tests"
    return "implementation"


def load_json(path: Path) -> dict[str, object]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def find_role_results(repo_root: Path, artifact_dir: Path | None) -> dict[str, Path | None]:
    results: dict[str, Path | None] = {role: None for role in ROLE_RESULT_FILES}
    search_roots = [artifact_dir] if artifact_dir else [repo_root / "artifacts", repo_root]
    for role, filename in ROLE_RESULT_FILES.items():
        for root in search_roots:
            if not root or not root.exists():
                continue
            matches = sorted(root.rglob(filename))
            if matches:
                results[role] = matches[0]
                break
    return results


def as_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    if value is None:
        return []
    return [str(value)]


def role_summary(role: str, payload: dict[str, object], path: Path, repo_root: Path) -> dict[str, object]:
    if role == "implementer":
        changed_files = as_list(payload.get("changed_files"))
        commands = as_list(payload.get("validation_commands"))
        commits = as_list(payload.get("code_commit_hash"))
    elif role == "tester":
        changed_files = as_list(payload.get("test_files_changed"))
        commands = as_list(payload.get("commands_run"))
        commits = as_list(payload.get("test_commit_hash"))
    elif role == "documenter":
        changed_files = as_list(payload.get("documentation_files_changed"))
        commands = as_list(payload.get("commands_run"))
        commits = as_list(payload.get("documentation_commit_hash"))
    else:
        changed_files = []
        commands = []
        commits = []

    return {
        "artifact_path": relpath(repo_root, path),
        "status": payload.get("status"),
        "branch_name": payload.get("branch_name"),
        "changed_files": changed_files,
        "commands": commands,
        "commit_hashes": [item for item in commits if item and item != "No Changes Made"],
        "artifact_file_paths": as_list(payload.get("artifact_file_paths")),
        "result_payload": payload,
    }


def high_signal_files(files: list[str], limit: int = 15) -> list[dict[str, object]]:
    scored: list[tuple[int, str]] = []
    for path in sorted(dict.fromkeys(files)):
        score = 0
        category = categorize(path)
        if category == "implementation":
            score += 4
        elif category == "tests":
            score += 3
        elif category == "documentation":
            score += 2
        else:
            score += 1
        if "/api/" in path or "/config/" in path or "/schema" in path:
            score += 1
        scored.append((score, path))
    ranked = sorted(scored, key=lambda item: (-item[0], item[1]))
    return [
        {"path": path, "category": categorize(path), "score": score}
        for score, path in ranked[:limit]
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description="Summarize the reviewer feature review surface from upstream artifacts.")
    parser.add_argument("--repo-root", default=".", help="Repository root or worktree root.")
    parser.add_argument("--artifact-dir", help="Artifact directory to search first.")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    artifact_dir = None
    if args.artifact_dir:
        artifact_dir = Path(args.artifact_dir)
        if not artifact_dir.is_absolute():
            artifact_dir = repo_root / artifact_dir
        artifact_dir = artifact_dir.resolve()

    role_paths = find_role_results(repo_root, artifact_dir)
    loaded: dict[str, dict[str, object]] = {}
    combined_files: list[str] = []
    combined_commands: list[str] = []
    combined_commits: list[str] = []

    for role, path in role_paths.items():
        if path is None:
            continue
        payload = load_json(path)
        summary = role_summary(role, payload, path, repo_root)
        loaded[role] = summary
        combined_files.extend(summary["changed_files"])
        combined_commands.extend(summary["commands"])
        combined_commits.extend(summary["commit_hashes"])

    categorized_files = {
        "implementation_files": [path for path in sorted(dict.fromkeys(combined_files)) if categorize(path) == "implementation"],
        "test_files": [path for path in sorted(dict.fromkeys(combined_files)) if categorize(path) == "tests"],
        "documentation_files": [path for path in sorted(dict.fromkeys(combined_files)) if categorize(path) == "documentation"],
        "guidance_files": [path for path in sorted(dict.fromkeys(combined_files)) if categorize(path) == "guidance"],
    }

    verifier_summary = loaded.get("verifier", {}).get("result_payload", {}) if "verifier" in loaded else {}
    result = {
        "artifact_dir_scanned": relpath(repo_root, artifact_dir) if artifact_dir and artifact_dir.exists() and artifact_dir.is_relative_to(repo_root) else (artifact_dir.as_posix() if artifact_dir else None),
        "roles_found": sorted(loaded.keys()),
        "missing_roles": [role for role in ROLE_RESULT_FILES if role not in loaded],
        "role_summaries": loaded,
        "combined_changed_files": sorted(dict.fromkeys(combined_files)),
        "categorized_files": categorized_files,
        "high_signal_files": high_signal_files(combined_files),
        "combined_commands": sorted(dict.fromkeys(item for item in combined_commands if item)),
        "combined_commit_hashes": sorted(dict.fromkeys(item for item in combined_commits if item)),
        "verifier_counts": {
            "blocking": verifier_summary.get("blocking_finding_count"),
            "warning": verifier_summary.get("warning_finding_count"),
            "note": verifier_summary.get("note_finding_count"),
            "verdict": verifier_summary.get("verdict"),
        },
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
