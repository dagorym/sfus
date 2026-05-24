#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


HEADING_PREFIX = "#"
DEFAULT_BASE_CANDIDATES = ("HEAD", "origin/main", "origin/master", "main", "master")
WORKTREE_REF = "WORKTREE"


def git_stdout(repo_root: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", "-C", str(repo_root), *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def find_repo_root(start: Path) -> Path:
    current = start.resolve()
    for candidate in [current, *current.parents]:
        if (candidate / ".git").exists():
            return candidate
    return current


def relpath(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def infer_base(repo_root: Path) -> tuple[str | None, list[str]]:
    assumptions: list[str] = []
    for candidate in DEFAULT_BASE_CANDIDATES:
        try:
            git_stdout(repo_root, "rev-parse", "--verify", candidate)
            assumptions.append(f"Comparison base inferred as {candidate}.")
            return candidate, assumptions
        except subprocess.CalledProcessError:
            continue
    return None, assumptions


def changed_files(repo_root: Path, base: str, head: str) -> list[str]:
    if head == WORKTREE_REF:
        output = git_stdout(repo_root, "diff", "--name-only", base)
    else:
        output = git_stdout(repo_root, "diff", "--name-only", f"{base}...{head}")
    return [line.strip() for line in output.splitlines() if line.strip()]


def file_diff_stats(repo_root: Path, base: str, head: str, path: str) -> dict[str, int]:
    if head == WORKTREE_REF:
        output = git_stdout(repo_root, "diff", "--numstat", base, "--", path)
    else:
        output = git_stdout(repo_root, "diff", "--numstat", f"{base}...{head}", "--", path)
    if not output:
        return {"added": 0, "deleted": 0}
    added, deleted, _name = output.split("\t", 2)
    return {"added": int(added or 0), "deleted": int(deleted or 0)}


def load_headings_from_ref(repo_root: Path, ref: str, path: str) -> list[str]:
    if ref == WORKTREE_REF:
        file_path = repo_root / path
        if not file_path.exists():
            return []
        text = file_path.read_text(encoding="utf-8")
        return [line.strip() for line in text.splitlines() if line.lstrip().startswith(HEADING_PREFIX)]
    try:
        text = git_stdout(repo_root, "show", f"{ref}:{path}")
    except subprocess.CalledProcessError:
        return []
    headings = [line.strip() for line in text.splitlines() if line.lstrip().startswith(HEADING_PREFIX)]
    return headings


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate design-document edit scope from a git diff.")
    parser.add_argument("--repo-root", default=".", help="Repository root or starting directory.")
    parser.add_argument("--base", help="Base branch or commit for the comparison.")
    parser.add_argument("--head", default=WORKTREE_REF, help=f"Head branch or commit for the comparison. Use {WORKTREE_REF} to inspect current working-tree edits.")
    parser.add_argument("--approved-file", action="append", default=[], help="Approved markdown file path. Repeat for multiple files.")
    parser.add_argument("--rewrite-threshold", type=int, default=120, help="Warn when total changed lines in a file exceed this threshold.")
    args = parser.parse_args()

    repo_root = find_repo_root(Path(args.repo_root))
    assumptions: list[str] = []
    base = args.base
    if not base:
        base, inferred = infer_base(repo_root)
        assumptions.extend(inferred)
    if not base:
        raise SystemExit("Unable to infer a comparison base. Pass --base explicitly.")

    changed = changed_files(repo_root, base, args.head)
    approved = set(args.approved_file)
    unapproved = [path for path in changed if approved and path not in approved]

    file_reports: list[dict[str, object]] = []
    warnings: list[str] = []
    for path in changed:
        if not path.lower().endswith(".md"):
            continue
        stats = file_diff_stats(repo_root, base, args.head, path)
        heading_before = load_headings_from_ref(repo_root, base, path)
        heading_after = load_headings_from_ref(repo_root, args.head, path)
        removed_headings = [value for value in heading_before if value not in heading_after]
        added_headings = [value for value in heading_after if value not in heading_before]
        changed_line_total = int(stats["added"]) + int(stats["deleted"])
        if changed_line_total >= args.rewrite_threshold:
            warnings.append(f"{path}: changed-line count {changed_line_total} exceeds rewrite threshold {args.rewrite_threshold}.")
        if removed_headings:
            warnings.append(f"{path}: headings removed; confirm structure changes were explicitly approved.")
        file_reports.append(
            {
                "path": path,
                "stats": stats,
                "changed_line_total": changed_line_total,
                "added_headings": added_headings,
                "removed_headings": removed_headings,
                "approved": path in approved if approved else True,
            }
        )

    if unapproved:
        warnings.append("Changed files include paths outside the approved file list.")

    result = {
        "repo_root": str(repo_root),
        "base_ref": base,
        "head_ref": args.head,
        "approved_files": sorted(approved),
        "changed_files": changed,
        "unapproved_files": unapproved,
        "file_reports": file_reports,
        "warnings": warnings,
        "assumptions": assumptions,
        "assumption_note": "Validation highlights likely scope drift and structural changes; final approval still depends on the user's accepted edit plan.",
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
