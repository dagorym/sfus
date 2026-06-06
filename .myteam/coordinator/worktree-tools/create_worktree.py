#!/usr/bin/env python3
"""
Usage:
  python create_worktree.py TOP_LEVEL_DIR BRANCH_NAME
  python create_worktree.py TOP_LEVEL_DIR AGENT_NAME [--from-branch BRANCH]

Creates a git worktree on a new branch.

Stage branches follow the naming convention <base>[-<subtask>]-<stage>-<YYYYMMDD>:
  base:    short plan-derived prefix chosen by the coordinator
  subtask: subtask identifier from the plan (omitted for plan-level stages
           such as the final reviewer)
  stage:   the agent that will run in the worktree
  date:    the date the subtask's Implementer was started; later stages
           inherit it unchanged

If the second argument ends in -YYYYMMDD it is treated as a full branch name,
validated against the convention, and used verbatim. Use this form when
branching off a non-stage branch (the Implementer from the coordination base,
or the Reviewer at plan level).

Otherwise the second argument is treated as a stage/agent name. The source
branch (--from-branch, or the current branch) must itself end in
-<stage>-<YYYYMMDD>; the stage segment is replaced with the new agent name and
the date is preserved, so all stages of a subtask share the Implementer's date.

If TOP_LEVEL_DIR resolves under /mnt/c/Users/.../Documents, the script uses
~/worktrees instead. Git worktrees are unreliable there under WSL.
"""

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path


def fail(message):
    print(f"Error: {message}", file=sys.stderr)
    sys.exit(1)


def require_clean_name(value, label):
    if not value:
        fail(f"{label} cannot be empty")
    if "/" in value:
        fail(f"{label} cannot contain '/' because the worktree directory matches the branch name")
    if not re.fullmatch(r"[A-Za-z0-9._-]+", value):
        fail(f"{label} may only contain letters, numbers, dot, underscore, and hyphen")


def looks_like_full_branch_name(value):
    return bool(re.search(r"-[0-9]{8}$", value))


STAGE_NAMES = {"implementer", "tester", "documenter", "verifier", "reviewer"}
STAGE_BRANCH_RE = re.compile(r"(.+)-([A-Za-z0-9_.]+)-([0-9]{8})")


def git(*args, check=True):
    result = subprocess.run(["git"] + list(args), capture_output=True, text=True)
    if check and result.returncode != 0:
        fail(result.stderr.strip() or f"git {' '.join(args)} failed")
    return result.stdout.strip()


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("top_level_dir")
    parser.add_argument("branch_or_agent")
    parser.add_argument(
        "--from-branch",
        dest="from_branch",
        default=None,
        help="Branch to base the new worktree on. Defaults to the current branch.",
    )
    args = parser.parse_args()

    top_level_dir = args.top_level_dir
    branch_or_agent = args.branch_or_agent

    git("rev-parse", "--show-toplevel")  # verify inside a git repo

    repo_root = git("rev-parse", "--show-toplevel")
    top_level_path = Path(os.path.abspath(os.path.expanduser(top_level_dir)))

    if args.from_branch:
        check = subprocess.run(
            ["git", "show-ref", "--verify", "--quiet", f"refs/heads/{args.from_branch}"],
            capture_output=True,
        )
        if check.returncode != 0:
            fail(f"--from-branch '{args.from_branch}' does not exist as a local branch")
        current_branch = args.from_branch
    else:
        current_branch = git("branch", "--show-current")
        if not current_branch:
            fail("detached HEAD is not supported")

    mnt_docs = re.compile(r"^/mnt/c/Users/[^/]+/Documents(/|$)")
    if mnt_docs.match(str(top_level_path)):
        fallback = Path.home() / "worktrees"
        print(f"Notice: {top_level_path} is under /mnt/c/Users/.../Documents, which is unreliable for git worktrees in WSL.", file=sys.stderr)
        print(f"Notice: using {fallback} instead.", file=sys.stderr)
        top_level_path = fallback

    if looks_like_full_branch_name(branch_or_agent):
        branch_name = branch_or_agent
        m = STAGE_BRANCH_RE.fullmatch(branch_name)
        if not m or m.group(2) not in STAGE_NAMES:
            fail(
                f"full branch name '{branch_name}' does not follow the "
                f"<base>[-<subtask>]-<stage>-<YYYYMMDD> convention with a known stage name "
                f"({', '.join(sorted(STAGE_NAMES))})"
            )
    else:
        agent_name = branch_or_agent
        require_clean_name(agent_name, "agent name")
        if agent_name not in STAGE_NAMES:
            fail(
                f"unknown stage/agent name '{agent_name}' "
                f"(expected one of: {', '.join(sorted(STAGE_NAMES))}); "
                "to create a branch outside the stage convention, pass a full branch name"
            )

        # Replace the stage segment of the source branch and preserve its date so
        # every stage of a subtask shares the Implementer's start date.
        m = STAGE_BRANCH_RE.fullmatch(current_branch)
        if not m or m.group(2) not in STAGE_NAMES:
            fail(
                f"cannot derive a stage branch name from '{current_branch}': it does not end in "
                f"-<stage>-<YYYYMMDD> with a known stage name ({', '.join(sorted(STAGE_NAMES))}). "
                "When branching off a non-stage branch (e.g. the coordination base), pass a full "
                "branch name instead: <base>[-<subtask>]-<agent>-<YYYYMMDD>"
            )
        branch_name = f"{m.group(1)}-{agent_name}-{m.group(3)}"

    require_clean_name(branch_name, "branch name")

    check_ref = subprocess.run(
        ["git", "check-ref-format", "--branch", branch_name],
        capture_output=True,
    )
    if check_ref.returncode != 0:
        fail(f"invalid git branch name: {branch_name}")

    worktree_dir = top_level_path / branch_name

    if Path(repo_root).resolve() == Path(str(worktree_dir)).resolve():
        fail("worktree directory cannot be the repository root")
    if worktree_dir.exists():
        fail(f"worktree directory already exists: {worktree_dir}")

    show_ref = subprocess.run(
        ["git", "show-ref", "--verify", "--quiet", f"refs/heads/{branch_name}"],
        capture_output=True,
    )
    if show_ref.returncode == 0:
        fail(f"branch already exists: {branch_name}")

    top_level_path.mkdir(parents=True, exist_ok=True)

    subprocess.run(
        ["git", "worktree", "add", "-b", branch_name, str(worktree_dir), current_branch],
        check=True,
    )

    print(f"Created branch: {branch_name}")
    print(f"Created worktree: {worktree_dir}")


if __name__ == "__main__":
    main()
