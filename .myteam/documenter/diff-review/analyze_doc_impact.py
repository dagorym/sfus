#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


GUIDANCE_FILES = {"AGENTS.md"}
GUIDANCE_DIRS = (".myteam/",)
DEFAULT_BASE_CANDIDATES = ("origin/main", "origin/master", "main", "master")


def git_stdout(repo_root: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", "-C", str(repo_root), *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def changed_files(repo_root: Path, base: str, head: str) -> list[str]:
    output = git_stdout(repo_root, "diff", "--name-only", f"{base}...{head}")
    return [line.strip() for line in output.splitlines() if line.strip()]


def infer_base(repo_root: Path) -> tuple[str | None, list[str]]:
    assumptions: list[str] = []
    for candidate in DEFAULT_BASE_CANDIDATES:
        try:
            git_stdout(repo_root, "rev-parse", "--verify", candidate)
            assumptions.append(f"Comparison base inferred as {candidate}.")
            return candidate, assumptions
        except subprocess.CalledProcessError:
            continue
    try:
        current = git_stdout(repo_root, "branch", "--show-current")
        upstream = git_stdout(repo_root, "rev-parse", "--abbrev-ref", f"{current}@{{upstream}}")
        assumptions.append(f"Comparison base inferred from upstream branch {upstream}.")
        return upstream, assumptions
    except subprocess.CalledProcessError:
        return None, assumptions


def categorize(files: list[str]) -> dict[str, list[str]]:
    docs: list[str] = []
    guidance: list[str] = []
    tests: list[str] = []
    implementation: list[str] = []
    for value in files:
        name = Path(value).name.lower()
        if value in GUIDANCE_FILES or any(value.startswith(prefix) for prefix in GUIDANCE_DIRS):
            guidance.append(value)
        elif value.startswith("docs/") or name.startswith("readme"):
            docs.append(value)
        elif (
            "/test" in value
            or "/tests/" in value
            or value.startswith("tests/")
            or value.endswith(("_test.py", ".test.js", ".test.ts", ".spec.js", ".spec.ts", "_test.go"))
        ):
            tests.append(value)
        else:
            implementation.append(value)
    return {
        "documentation_files": docs,
        "guidance_files": guidance,
        "test_files": tests,
        "implementation_files": implementation,
    }


def candidate_doc_targets(repo_root: Path, implementation_files: list[str], limit: int) -> list[str]:
    candidates: list[str] = []
    docs_root = repo_root / "docs"
    if docs_root.exists():
        for path in docs_root.rglob("*"):
            if path.is_file():
                candidates.append(path.relative_to(repo_root).as_posix())
    for path in repo_root.glob("README*"):
        if path.is_file():
            candidates.append(path.relative_to(repo_root).as_posix())

    stems = {Path(value).stem.lower().replace("_", "-") for value in implementation_files}
    ranked: list[tuple[int, str]] = []
    for candidate in dict.fromkeys(candidates):
        lower = candidate.lower()
        score = sum(1 for stem in stems if stem and stem in lower)
        if lower.startswith("docs/"):
            score += 1
        if score:
            ranked.append((score, candidate))
    ranked.sort(key=lambda item: (-item[0], item[1]))
    if ranked:
        return [value for _score, value in ranked[:limit]]
    return list(dict.fromkeys(candidates))[:limit]


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze documentation impact from a git diff.")
    parser.add_argument("--repo-root", default=".", help="Repository root or worktree root.")
    parser.add_argument("--base", help="Base branch or commit for the comparison.")
    parser.add_argument("--head", default="HEAD", help="Head branch or commit for the comparison.")
    parser.add_argument("--limit", type=int, default=10, help="Maximum number of candidate documentation targets.")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    assumptions: list[str] = []
    base = args.base
    if not base:
        base, inferred = infer_base(repo_root)
        assumptions.extend(inferred)
    if not base:
        raise SystemExit("Unable to infer a comparison base. Pass --base explicitly.")

    files = changed_files(repo_root, base, args.head)
    groups = categorize(files)
    candidates = candidate_doc_targets(repo_root, groups["implementation_files"], args.limit)

    likely_doc_impact = bool(groups["documentation_files"] or groups["implementation_files"] or groups["guidance_files"])
    existing_docs_may_be_outdated = bool(groups["implementation_files"]) and bool(candidates)

    result = {
        "base_ref": base,
        "head_ref": args.head,
        "changed_files": files,
        "likely_documentation_impact": likely_doc_impact,
        "existing_docs_may_be_outdated": existing_docs_may_be_outdated,
        "candidate_documentation_targets": candidates,
        "guidance_review_likely": bool(groups["guidance_files"]),
        "categorized_files": groups,
        "assumptions": assumptions,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
