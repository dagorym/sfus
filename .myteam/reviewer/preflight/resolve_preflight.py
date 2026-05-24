#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


ARTIFACT_RE = re.compile(r"(artifacts/[A-Za-z0-9._/\-]+)")
PLAN_RE = re.compile(r"([A-Za-z0-9._/\-]*plans/[A-Za-z0-9._/\-]+\.md)")
BRANCH_RE = re.compile(r"\bbranch(?:es)?[: ]+([A-Za-z0-9._/\-]+)")
TRAILING_ROLE_RE = re.compile(r"\b(implementer|tester|documenter|verifier|reviewer)\b$", re.IGNORECASE)
ROLE_RESULT_FILES = {
    "implementer": "implementer_result.json",
    "tester": "tester_result.json",
    "documenter": "documenter_result.json",
    "verifier": "verifier_result.json",
}


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


def derive_task_slug(text: str) -> str:
    for line in text.splitlines():
        stripped = line.strip().lstrip("-#* ").strip()
        if not stripped:
            continue
        lowered = TRAILING_ROLE_RE.sub("", stripped.lower()).strip()
        lowered = re.sub(r"[^a-z0-9]+", "-", lowered)
        lowered = re.sub(r"-{2,}", "-", lowered).strip("-")
        if lowered:
            return lowered
    return "task"


def relpath(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def find_plan_candidates(repo_root: Path, limit: int) -> list[str]:
    results: list[Path] = []
    for folder in ("plans", "artifacts", "docs"):
        base = repo_root / folder
        if not base.exists():
            continue
        results.extend(base.rglob("*.md"))
    ranked = sorted(
        dict.fromkeys(results),
        key=lambda path: (
            0 if "plan" in path.name.lower() else 1,
            0 if "completed" not in path.as_posix().lower() else 1,
            len(path.as_posix()),
            path.as_posix(),
        ),
    )
    return [relpath(repo_root, path) for path in ranked[:limit]]


def find_convention_candidates(repo_root: Path, limit: int) -> list[str]:
    results: list[Path] = []
    for name in ("AGENTS.md", "CLAUDE.md", "CONTRIBUTING.md", "README.md"):
        path = repo_root / name
        if path.exists():
            results.append(path)
    for folder in (repo_root / ".myteam", repo_root / "docs"):
        if not folder.exists():
            continue
        for path in folder.rglob("*.md"):
            lower = path.name.lower()
            if folder.name == ".myteam" or any(
                token in lower for token in ("guide", "convention", "policy", "style", "review")
            ):
                results.append(path)
    ranked = sorted(
        dict.fromkeys(results),
        key=lambda path: (
            0 if path.name in {"AGENTS.md", "CLAUDE.md"} else 1,
            len(path.as_posix()),
            path.as_posix(),
        ),
    )
    return [relpath(repo_root, path) for path in ranked[:limit]]


def scan_upstream_artifacts(repo_root: Path, limit: int) -> tuple[dict[str, list[str]], list[str]]:
    role_paths: dict[str, list[str]] = {role: [] for role in ROLE_RESULT_FILES}
    artifact_dirs: set[str] = set()
    artifacts_root = repo_root / "artifacts"
    if not artifacts_root.exists():
        return role_paths, []
    for role, filename in ROLE_RESULT_FILES.items():
        for path in artifacts_root.rglob(filename):
            rel = relpath(repo_root, path)
            role_paths[role].append(rel)
            artifact_dirs.add(relpath(repo_root, path.parent))
    for role in role_paths:
        role_paths[role] = sorted(role_paths[role])[:limit]
    return role_paths, sorted(artifact_dirs)[:limit]


def extract_matches(pattern: re.Pattern[str], text: str) -> list[str]:
    seen: list[str] = []
    for match in pattern.finditer(text):
        value = match.group(1).strip().lstrip("./")
        if value not in seen:
            seen.append(value)
    return seen


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
    parser = argparse.ArgumentParser(description="Resolve reviewer preflight context from prompt text and repository evidence.")
    parser.add_argument("--input", help="Path to reviewer prompt text. Defaults to stdin.")
    parser.add_argument("--repo-root", default=".", help="Repository root or starting directory.")
    parser.add_argument("--limit", type=int, default=12, help="Maximum candidates to return per category.")
    args = parser.parse_args()

    text = load_text(args.input)
    repo_root = find_repo_root(Path(args.repo_root))

    mentioned_artifact_dirs = extract_matches(ARTIFACT_RE, text)
    mentioned_plans = extract_matches(PLAN_RE, text)
    mentioned_branches = extract_matches(BRANCH_RE, text)
    upstream_artifacts_by_role, candidate_artifact_dirs = scan_upstream_artifacts(repo_root, args.limit)

    assumptions: list[str] = []
    artifact_dir = mentioned_artifact_dirs[0] if mentioned_artifact_dirs else None
    if not artifact_dir:
        artifact_dir = f"artifacts/{derive_task_slug(text)}"
        assumptions.append("Shared artifact directory inferred from prompt text.")

    plan_candidates = mentioned_plans or find_plan_candidates(repo_root, args.limit)
    if not mentioned_plans and plan_candidates:
        assumptions.append("Plan candidates inferred from repository evidence.")

    convention_candidates = find_convention_candidates(repo_root, args.limit)
    if convention_candidates:
        assumptions.append("Convention-file candidates inferred from repository evidence.")

    if not mentioned_branches:
        for role_paths in upstream_artifacts_by_role.values():
            for artifact_path in role_paths:
                if artifact_path.startswith("artifacts/"):
                    mentioned_branches.append(Path(artifact_path).parent.name)
                    break
            if mentioned_branches:
                break

    result = {
        "shared_artifact_directory": artifact_dir,
        "mentioned_plan_paths": mentioned_plans,
        "candidate_plan_sources": plan_candidates,
        "mentioned_branch_names": mentioned_branches,
        "candidate_artifact_directories": candidate_artifact_dirs,
        "upstream_artifacts_by_role": upstream_artifacts_by_role,
        "candidate_convention_files": convention_candidates,
        "branch_context": branch_context(repo_root),
        "assumptions": assumptions,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
