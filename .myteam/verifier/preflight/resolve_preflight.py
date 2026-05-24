#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


SECTION_HEADERS = [
    "Original task summary",
    "Acceptance criteria to verify",
    "Implementation branch or worktree context",
    "Files modified by the Implementer, Tester, and Documenter",
    "Commands executed",
    "Final test outcomes",
    "Plan or evaluation context guidance",
    "Convention-file guidance",
    "Updated documentation files",
    "Shared artifact directory",
    "Verification scope",
    "Completion gate",
]
ARTIFACT_RE = re.compile(r"(artifacts/[A-Za-z0-9._/\-]+)")
TRAILING_ROLE_RE = re.compile(r"\b(implementer|tester|documenter|verifier)\b$", re.IGNORECASE)


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


def git_stdout(repo_root: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", "-C", str(repo_root), *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def extract_section(text: str, title: str) -> str:
    pattern = re.compile(
        rf"^{re.escape(title)}:\s*$\n(.*?)(?=^(?:{'|'.join(re.escape(item) for item in SECTION_HEADERS)}):\s*$|\Z)",
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
    match = ARTIFACT_RE.search(value)
    if match:
        return match.group(1).strip("/")
    stripped = value.strip().strip("/")
    return stripped or None


def derive_task_slug(summary: str) -> str:
    lowered = TRAILING_ROLE_RE.sub("", summary.strip().lower()).strip()
    lowered = re.sub(r"[^a-z0-9]+", "-", lowered)
    lowered = re.sub(r"-{2,}", "-", lowered).strip("-")
    return lowered or "task"


def relpath(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def find_plan_candidates(repo_root: Path, limit: int = 12) -> list[str]:
    candidates: list[Path] = []
    for folder in ("plans", "artifacts"):
        base = repo_root / folder
        if not base.exists():
            continue
        for pattern in ("*.md", "*.txt", "*.json"):
            candidates.extend(base.rglob(pattern))
    ranked = sorted(dict.fromkeys(candidates), key=lambda path: (0 if "plan" in path.name.lower() else 1, len(path.as_posix()), path.as_posix()))
    return [relpath(repo_root, path) for path in ranked[:limit]]


def find_convention_candidates(repo_root: Path, limit: int = 12) -> list[str]:
    results: list[Path] = []
    explicit_files = ["AGENTS.md", "CLAUDE.md", "CONTRIBUTING.md", "README.md"]
    for name in explicit_files:
        path = repo_root / name
        if path.exists():
            results.append(path)
    myteam_root = repo_root / ".myteam"
    if myteam_root.exists():
        for path in myteam_root.rglob("*.md"):
            results.append(path)
    docs_root = repo_root / "docs"
    if docs_root.exists():
        for path in docs_root.rglob("*.md"):
            if any(token in path.name.lower() for token in ("contrib", "style", "guide", "convention", "policy")):
                results.append(path)
    ranked = sorted(dict.fromkeys(results), key=lambda path: (0 if path.name in {"AGENTS.md", "CLAUDE.md"} else 1, len(path.as_posix()), path.as_posix()))
    return [relpath(repo_root, path) for path in ranked[:limit]]


def branch_context(repo_root: Path) -> dict[str, str | bool | None]:
    result: dict[str, str | bool | None] = {
        "branch_name": None,
        "head_commit": None,
        "inside_worktree": None,
    }
    try:
        result["branch_name"] = git_stdout(repo_root, "branch", "--show-current") or "DETACHED"
    except subprocess.CalledProcessError:
        result["branch_name"] = None
    try:
        result["head_commit"] = git_stdout(repo_root, "rev-parse", "HEAD")
    except subprocess.CalledProcessError:
        result["head_commit"] = None
    try:
        git_dir = git_stdout(repo_root, "rev-parse", "--git-dir")
        result["inside_worktree"] = ".git/worktrees/" in git_dir or git_dir.endswith("/.git")
    except subprocess.CalledProcessError:
        result["inside_worktree"] = None
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Resolve verifier preflight context from prompt text and repository evidence.")
    parser.add_argument("--input", help="Path to the verifier handoff prompt. Defaults to stdin.")
    parser.add_argument("--repo-root", default=".", help="Repository root or starting directory.")
    args = parser.parse_args()

    text = load_text(args.input)
    repo_root = find_repo_root(Path(args.repo_root))

    original_task_summary = parse_bullets(extract_section(text, "Original task summary"))
    acceptance_criteria = parse_bullets(extract_section(text, "Acceptance criteria to verify"))
    implementation_context = parse_bullets(extract_section(text, "Implementation branch or worktree context"))
    modified_files = parse_bullets(extract_section(text, "Files modified by the Implementer, Tester, and Documenter"))
    commands_executed = parse_bullets(extract_section(text, "Commands executed"))
    final_test_outcomes = parse_bullets(extract_section(text, "Final test outcomes"))
    plan_context_guidance = parse_bullets(extract_section(text, "Plan or evaluation context guidance"))
    convention_guidance = parse_bullets(extract_section(text, "Convention-file guidance"))
    documentation_files = parse_bullets(extract_section(text, "Updated documentation files"))
    artifact_dir = normalize_artifact_dir(extract_section(text, "Shared artifact directory"))

    assumptions: list[str] = []
    task_summary = original_task_summary[0] if original_task_summary else "task"
    if not artifact_dir:
        artifact_dir = f"artifacts/{derive_task_slug(task_summary)}"
        assumptions.append("Shared artifact directory inferred from task summary.")

    plan_candidates = find_plan_candidates(repo_root)
    if not plan_context_guidance and plan_candidates:
        assumptions.append("Plan or evaluation source candidates inferred from repository evidence.")

    convention_candidates = find_convention_candidates(repo_root)
    if not convention_guidance and convention_candidates:
        assumptions.append("Convention-file candidates inferred from repository evidence.")

    result = {
        "task_summary": original_task_summary,
        "acceptance_criteria": acceptance_criteria,
        "implementation_context": implementation_context,
        "modified_files": modified_files,
        "commands_executed": commands_executed,
        "final_test_outcomes": final_test_outcomes,
        "plan_context_guidance": plan_context_guidance,
        "convention_guidance": convention_guidance,
        "documentation_files": documentation_files,
        "shared_artifact_directory": artifact_dir,
        "branch_context": branch_context(repo_root),
        "candidate_plan_sources": plan_candidates,
        "candidate_convention_files": convention_candidates,
        "assumptions": assumptions,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
