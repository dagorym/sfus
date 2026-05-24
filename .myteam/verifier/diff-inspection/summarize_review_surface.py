#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path


DEFAULT_BASE_CANDIDATES = ("origin/main", "origin/master", "main", "master")
HUNK_RE = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")


def git_stdout(repo_root: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", "-C", str(repo_root), *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


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


def changed_files(repo_root: Path, base: str, head: str) -> list[str]:
    output = git_stdout(repo_root, "diff", "--name-only", f"{base}...{head}")
    return [line.strip() for line in output.splitlines() if line.strip()]


def patch_text(repo_root: Path, base: str, head: str) -> str:
    return git_stdout(repo_root, "diff", "--unified=0", f"{base}...{head}")


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


def parse_line_ranges(diff_text: str) -> dict[str, list[dict[str, int]]]:
    ranges: dict[str, list[dict[str, int]]] = {}
    current_file: str | None = None
    for line in diff_text.splitlines():
        if line.startswith("diff --git "):
            current_file = None
            continue
        if line.startswith("+++ b/"):
            current_file = line[6:]
            ranges.setdefault(current_file, [])
            continue
        match = HUNK_RE.match(line)
        if match and current_file:
            start = int(match.group(1))
            length = int(match.group(2) or "1")
            ranges[current_file].append({"start": start, "end": start + max(length - 1, 0)})
    return ranges


def build_summary(files: list[str], line_ranges: dict[str, list[dict[str, int]]]) -> dict[str, list[str]]:
    groups = {
        "implementation_files": [],
        "test_files": [],
        "documentation_files": [],
        "guidance_files": [],
    }
    for path in files:
        category = categorize(path)
        if category == "implementation":
            groups["implementation_files"].append(path)
        elif category == "tests":
            groups["test_files"].append(path)
        elif category == "documentation":
            groups["documentation_files"].append(path)
        else:
            groups["guidance_files"].append(path)
    return groups


def high_signal_files(files: list[str], line_ranges: dict[str, list[dict[str, int]]], limit: int = 12) -> list[dict[str, object]]:
    scored: list[tuple[int, str]] = []
    for path in files:
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
        score += len(line_ranges.get(path, []))
        scored.append((score, path))
    ranked = sorted(scored, key=lambda item: (-item[0], item[1]))
    return [
        {
            "path": path,
            "category": categorize(path),
            "line_ranges": line_ranges.get(path, []),
            "score": score,
        }
        for score, path in ranked[:limit]
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description="Summarize the verifier review surface from git diff context.")
    parser.add_argument("--repo-root", default=".", help="Repository root or worktree root.")
    parser.add_argument("--base", help="Base branch or commit for the comparison.")
    parser.add_argument("--head", default="HEAD", help="Head branch or commit for the comparison.")
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
    diff = patch_text(repo_root, base, args.head)
    line_ranges = parse_line_ranges(diff)
    categorized = build_summary(files, line_ranges)
    result = {
        "base_ref": base,
        "head_ref": args.head,
        "changed_files": files,
        "categorized_files": categorized,
        "line_ranges": line_ranges,
        "high_signal_files": high_signal_files(files, line_ranges),
        "assumptions": assumptions,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
