#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


SECTION_TITLES = [
    "Task summary",
    "Acceptance criteria validated",
    "Implementation branch or worktree context",
    "Files modified by Implementer and Tester to inspect for documentation impact",
    "Test commit",
    "Commands executed",
    "Final test outcomes",
    "Documentation context",
    "Plan and diff context",
    "Startup behavior",
    "Shared artifact directory",
    "Completion gate",
]

ARTIFACT_PATH_RE = re.compile(r"(artifacts/[A-Za-z0-9._/\-]+)")
PLAN_PATH_RE = re.compile(r"([A-Za-z0-9._/\-]*plans/[A-Za-z0-9._/\-]+\.md)")
BASE_REF_RE = re.compile(r"\b(?:base(?: branch| commit)?|compare(?:d|ison)?(?: base)?)[: ]+([A-Za-z0-9._/\-]+)")
ROLE_SUFFIX_RE = re.compile(r"\b(implementer|tester|documenter|verifier)\b$", re.IGNORECASE)
DOC_PATH_HINT_RE = re.compile(r"(^docs(?:/|$)|(^|/)(README|readme)(?:\.[A-Za-z0-9]+)?$)")


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
    base = ROLE_SUFFIX_RE.sub("", task_summary.strip()).strip().lower()
    base = re.sub(r"[^a-z0-9]+", "-", base)
    base = re.sub(r"-{2,}", "-", base).strip("-")
    return base or "task"


def relpath(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def find_plan_candidates(repo_root: Path, task_summary: str, limit: int) -> list[str]:
    plans_root = repo_root / "plans"
    if not plans_root.exists():
        return []

    slug_terms = [term for term in derive_task_slug(task_summary).split("-") if term]
    scored: list[tuple[int, str]] = []
    for path in plans_root.rglob("*.md"):
        rel = relpath(repo_root, path)
        score = 0
        lower = rel.lower()
        if "completed/" not in lower:
            score += 2
        score += sum(1 for term in slug_terms if term and term in lower)
        if score:
            scored.append((score, rel))
    scored.sort(key=lambda item: (-item[0], item[1]))
    return [value for _score, value in scored[:limit]]


def guess_base_ref(plan_and_diff_context: list[str], implementation_context: list[str]) -> str | None:
    for value in plan_and_diff_context + implementation_context:
        match = BASE_REF_RE.search(value)
        if match:
            return match.group(1)
    return None


def detect_doc_targets(repo_root: Path, changed_files: list[str], limit: int) -> list[str]:
    candidates: list[str] = []
    docs_root = repo_root / "docs"
    if docs_root.exists():
        for path in docs_root.rglob("*"):
            if path.is_file():
                candidates.append(relpath(repo_root, path))

    for special in repo_root.glob("README*"):
        if special.is_file():
            candidates.append(relpath(repo_root, special))

    if changed_files:
        stems = {
            Path(value).stem.lower().replace("_", "-")
            for value in changed_files
            if not DOC_PATH_HINT_RE.search(value)
        }
        ranked: list[tuple[int, str]] = []
        for candidate in dict.fromkeys(candidates):
            lower = candidate.lower()
            score = 0
            if DOC_PATH_HINT_RE.search(candidate):
                score += 1
            score += sum(2 for stem in stems if stem and stem in lower)
            if score:
                ranked.append((score, candidate))
        ranked.sort(key=lambda item: (-item[0], item[1]))
        if ranked:
            return [value for _score, value in ranked[:limit]]

    return list(dict.fromkeys(candidates))[:limit]


def main() -> int:
    parser = argparse.ArgumentParser(description="Resolve documenter preflight context from prompt text and repository evidence.")
    parser.add_argument("--input", help="Path to the documenter handoff prompt. Defaults to stdin.")
    parser.add_argument("--repo-root", default=".", help="Repository root or starting directory.")
    parser.add_argument("--limit", type=int, default=10, help="Maximum number of plan or doc candidates to return.")
    args = parser.parse_args()

    text = load_text(args.input)
    repo_root = find_repo_root(Path(args.repo_root))

    task_summary = parse_bullets(extract_section(text, "Task summary"))
    acceptance_criteria = parse_bullets(extract_section(text, "Acceptance criteria validated"))
    implementation_context = parse_bullets(extract_section(text, "Implementation branch or worktree context"))
    changed_files = parse_bullets(
        extract_section(text, "Files modified by Implementer and Tester to inspect for documentation impact")
    )
    test_commit = parse_bullets(extract_section(text, "Test commit"))
    commands_executed = parse_bullets(extract_section(text, "Commands executed"))
    final_test_outcomes = parse_bullets(extract_section(text, "Final test outcomes"))
    documentation_context = parse_bullets(extract_section(text, "Documentation context"))
    plan_and_diff_context = parse_bullets(extract_section(text, "Plan and diff context"))
    shared_artifact_directory = normalize_artifact_dir(extract_section(text, "Shared artifact directory"))

    assumptions: list[str] = []
    task_line = task_summary[0] if task_summary else "task"
    if not shared_artifact_directory:
        shared_artifact_directory = f"artifacts/{derive_task_slug(task_line)}"
        assumptions.append("Shared artifact directory inferred from task summary.")

    plan_path = None
    for value in plan_and_diff_context + documentation_context + implementation_context:
        match = PLAN_PATH_RE.search(value)
        if match:
            plan_path = match.group(1).lstrip("./")
            break
    if not plan_path:
        plan_candidates = find_plan_candidates(repo_root, task_line, args.limit)
        if plan_candidates:
            plan_path = plan_candidates[0]
            assumptions.append("Plan path inferred from repository plan files.")
        else:
            plan_candidates = []
    else:
        plan_candidates = [plan_path]

    comparison_base = guess_base_ref(plan_and_diff_context, implementation_context)
    if comparison_base:
        assumptions.append("Comparison base recovered from handoff context.")

    changed_doc_files = [value for value in changed_files if DOC_PATH_HINT_RE.search(value)]
    candidate_doc_targets = detect_doc_targets(repo_root, changed_files, args.limit)

    result = {
        "task_summary": task_summary,
        "acceptance_criteria_validated": acceptance_criteria,
        "implementation_context": implementation_context,
        "changed_files_for_documentation": changed_files,
        "test_commit_hash": test_commit[0] if test_commit else None,
        "commands_executed": commands_executed,
        "final_test_outcomes": final_test_outcomes,
        "documentation_context": documentation_context,
        "plan_and_diff_context": plan_and_diff_context,
        "shared_artifact_directory": shared_artifact_directory,
        "inferred_plan_path": plan_path,
        "comparison_base_hint": comparison_base,
        "candidate_documentation_targets": candidate_doc_targets,
        "changed_documentation_files": changed_doc_files,
        "assumptions": assumptions,
        "repository_evidence": {
            "repo_root": str(repo_root),
            "plan_candidates": plan_candidates,
            "doc_targets_considered": candidate_doc_targets,
        },
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
