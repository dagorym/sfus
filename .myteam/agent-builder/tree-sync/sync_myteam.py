#!/usr/bin/env python3
"""
Usage:
  python sync_myteam.py [--apply] [--target NAME ...]   # push: canonical -> targets
  python sync_myteam.py --pull NAME [--apply]           # pull: one target -> canonical

Mirrors the canonical .myteam tree (the one containing this script) to the
downstream repositories listed in the colocated targets.yaml, or pulls one
target's tree back into the canonical repository.

Plan classification for every file in the union of both trees:
  CREATE               in source only -> copied to destination
  UPDATE               in both, content differs -> overwritten in destination
  DELETE               in destination only -> removed (this is how moves and
                       deletions propagate)
  PRESERVED            matches the target's preserve list; owned by the
                       target repo, never synced in either direction
  PRESERVED-DIVERGENT  preserved path whose counterpart exists and differs;
                       reported for manual review, never auto-resolved

Without --apply this is a dry run: the full plan is printed and nothing is
written. With --apply, the destination repository's .myteam must be clean in
git so every applied change is reviewable in the destination's git diff.

Exit codes: 0 clean, 3 completed with PRESERVED-DIVERGENT entries needing
manual review, 1 error.

The tool never commits and never touches files outside .myteam.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


IGNORED_DIR_NAMES = {"__pycache__"}
IGNORED_SUFFIXES = {".pyc"}


def fail(message: str) -> None:
    print(f"Error: {message}", file=sys.stderr)
    sys.exit(1)


def parse_targets(path: Path) -> list[dict[str, object]]:
    """Parse the restricted targets.yaml schema (version, targets list with
    name, path, preserve). Unknown structure fails loudly."""
    if not path.exists():
        fail(f"targets file not found: {path}")
    targets: list[dict[str, object]] = []
    current: dict[str, object] | None = None
    in_preserve = False
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        stripped = raw.strip()
        indent = len(raw) - len(raw.lstrip(" "))
        if indent == 0:
            in_preserve = False
            key, _, value = stripped.partition(":")
            key, value = key.strip(), value.strip()
            if key == "version":
                if value != "1":
                    fail(f"unsupported targets.yaml version: {value!r}")
            elif key == "targets":
                if value:
                    fail("targets must be a block list")
            else:
                fail(f"unknown top-level key in targets.yaml: {key!r}")
        elif indent == 2 and stripped.startswith("- "):
            in_preserve = False
            key, _, value = stripped[2:].partition(":")
            if key.strip() != "name":
                fail("each target entry must start with a name field")
            current = {"name": value.strip(), "path": None, "preserve": []}
            targets.append(current)
        elif indent == 4 and current is not None:
            key, _, value = stripped.partition(":")
            key, value = key.strip(), value.strip()
            if key == "path":
                in_preserve = False
                current["path"] = value
            elif key == "preserve":
                if value == "[]":
                    in_preserve = False
                elif value == "":
                    in_preserve = True
                else:
                    fail("preserve must be a block list or []")
            else:
                fail(f"unknown target key in targets.yaml: {key!r}")
        elif indent == 6 and stripped.startswith("- ") and current is not None and in_preserve:
            current["preserve"].append(stripped[2:].strip())
        else:
            fail(f"unparseable line in targets.yaml: {raw!r}")

    names = [t["name"] for t in targets]
    if len(names) != len(set(names)):
        fail("duplicate target names in targets.yaml")
    for target in targets:
        if not target["name"] or not target["path"]:
            fail("every target needs a name and a path")
    return targets


def git_stdout(repo_root: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", "-C", str(repo_root), *args],
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        fail(completed.stderr.strip() or f"git -C {repo_root} {' '.join(args)} failed")
    return completed.stdout.strip()


def ensure_repo_with_myteam(repo_root: Path, label: str) -> Path:
    if not repo_root.is_dir():
        fail(f"{label} does not exist: {repo_root}")
    inside = subprocess.run(
        ["git", "-C", str(repo_root), "rev-parse", "--is-inside-work-tree"],
        capture_output=True, text=True,
    )
    if inside.returncode != 0 or inside.stdout.strip() != "true":
        fail(f"{label} is not a git repository: {repo_root}")
    myteam = repo_root / ".myteam"
    if not myteam.is_dir():
        fail(f"{label} has no .myteam tree: {repo_root}")
    return myteam


def ensure_clean_myteam(repo_root: Path, label: str) -> None:
    status = git_stdout(repo_root, "status", "--porcelain", "--", ".myteam")
    if status:
        fail(
            f"{label} has uncommitted .myteam changes; commit or clean them "
            f"before applying so the sync is reviewable on its own:\n{status}"
        )


def collect_files(root: Path) -> dict[str, Path]:
    files: dict[str, Path] = {}
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(root)
        if any(part in IGNORED_DIR_NAMES for part in rel.parts):
            continue
        if path.suffix in IGNORED_SUFFIXES:
            continue
        files[rel.as_posix()] = path
    return files


def is_preserved(rel: str, preserve: list[str]) -> bool:
    for entry in preserve:
        if entry.endswith("/"):
            if rel == entry[:-1] or rel.startswith(entry):
                return True
        elif rel == entry:
            return True
    return False


def files_differ(a: Path, b: Path) -> bool:
    return a.read_bytes() != b.read_bytes()


def build_plan(
    src_files: dict[str, Path],
    dst_files: dict[str, Path],
    preserve: list[str],
) -> dict[str, list[str] | int]:
    plan: dict[str, list[str] | int] = {
        "create": [],
        "update": [],
        "delete": [],
        "preserved": [],
        "preserved_divergent": [],
        "same": 0,
    }
    for rel in sorted(set(src_files) | set(dst_files)):
        in_src = rel in src_files
        in_dst = rel in dst_files
        if is_preserved(rel, preserve):
            if in_src and in_dst and files_differ(src_files[rel], dst_files[rel]):
                plan["preserved_divergent"].append(rel)
            else:
                plan["preserved"].append(rel)
        elif in_src and not in_dst:
            plan["create"].append(rel)
        elif not in_src and in_dst:
            plan["delete"].append(rel)
        elif files_differ(src_files[rel], dst_files[rel]):
            plan["update"].append(rel)
        else:
            plan["same"] += 1
    return plan


def print_plan(plan: dict[str, list[str] | int]) -> None:
    for action, key in (
        ("CREATE", "create"),
        ("UPDATE", "update"),
        ("DELETE", "delete"),
        ("PRESERVED", "preserved"),
    ):
        for rel in plan[key]:
            print(f"  {action:<20} {rel}")
    for rel in plan["preserved_divergent"]:
        print(f"  {'PRESERVED-DIVERGENT':<20} {rel}  <- review manually")
    print(
        f"  plan: {len(plan['create'])} create, {len(plan['update'])} update, "
        f"{len(plan['delete'])} delete, "
        f"{len(plan['preserved']) + len(plan['preserved_divergent'])} preserved "
        f"({len(plan['preserved_divergent'])} divergent), "
        f"{plan['same']} identical"
    )


def apply_plan(
    plan: dict[str, list[str] | int],
    src_files: dict[str, Path],
    dst_root: Path,
) -> None:
    for rel in [*plan["create"], *plan["update"]]:
        destination = dst_root / rel
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_files[rel], destination)
    for rel in plan["delete"]:
        (dst_root / rel).unlink()
    # Prune directories emptied by deletions, deepest first.
    for directory in sorted(
        (p for p in dst_root.rglob("*") if p.is_dir()), reverse=True
    ):
        if not any(directory.iterdir()):
            directory.rmdir()


def sync_one(
    label: str,
    src_root: Path,
    dst_root: Path,
    dst_repo: Path,
    preserve: list[str],
    apply: bool,
) -> bool:
    """Plan (and optionally apply) one directional sync. Returns True when
    PRESERVED-DIVERGENT entries need manual review."""
    print(f"=== {label} ===")
    plan = build_plan(collect_files(src_root), collect_files(dst_root), preserve)
    print_plan(plan)
    has_changes = bool(plan["create"] or plan["update"] or plan["delete"])
    if not apply:
        if has_changes:
            print("  dry run: no changes made; re-run with --apply to execute")
    elif has_changes:
        ensure_clean_myteam(dst_repo, f"destination {dst_repo}")
        apply_plan(plan, collect_files(src_root), dst_root)
        print(
            f"  applied; review with `git -C {dst_repo} status` / `git diff`, "
            "then commit with approval"
        )
    else:
        print("  nothing to apply")
    if plan["preserved_divergent"]:
        print(
            "  WARNING: preserved files diverge from their counterparts; "
            "diff and merge any new content manually"
        )
    print()
    return bool(plan["preserved_divergent"])


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--apply", action="store_true", help="Execute the plan instead of dry-running.")
    parser.add_argument("--target", action="append", help="Push only to this named target (repeatable).")
    parser.add_argument("--pull", metavar="NAME", help="Pull one named target's .myteam into the canonical repo.")
    args = parser.parse_args()

    if args.pull and args.target:
        fail("--pull and --target are mutually exclusive; pull takes exactly one source name")

    script_dir = Path(__file__).resolve().parent
    canonical_myteam = script_dir.parents[1]
    if canonical_myteam.name != ".myteam":
        fail(f"cannot locate canonical .myteam from script location: {script_dir}")
    canonical_repo = canonical_myteam.parent
    ensure_repo_with_myteam(canonical_repo, "canonical repository")

    targets = parse_targets(script_dir / "targets.yaml")
    by_name = {t["name"]: t for t in targets}

    needs_review = False
    if args.pull:
        target = by_name.get(args.pull)
        if target is None:
            fail(f"unknown pull source '{args.pull}' (known targets: {', '.join(by_name)})")
        repo = Path(str(target["path"])).expanduser().resolve()
        myteam = ensure_repo_with_myteam(repo, f"pull source '{target['name']}'")
        needs_review = sync_one(
            f"pull: {target['name']} ({repo}) -> canonical ({canonical_repo})",
            myteam, canonical_myteam, canonical_repo, target["preserve"], args.apply,
        )
    else:
        selected = targets
        if args.target:
            unknown = [name for name in args.target if name not in by_name]
            if unknown:
                fail(f"unknown target(s): {', '.join(unknown)} (known: {', '.join(by_name)})")
            selected = [by_name[name] for name in args.target]
        for target in selected:
            repo = Path(str(target["path"])).expanduser().resolve()
            myteam = ensure_repo_with_myteam(repo, f"target '{target['name']}'")
            divergent = sync_one(
                f"push: canonical ({canonical_repo}) -> {target['name']} ({repo})",
                canonical_myteam, myteam, repo, target["preserve"], args.apply,
            )
            needs_review = needs_review or divergent

    return 3 if needs_review else 0


if __name__ == "__main__":
    raise SystemExit(main())
