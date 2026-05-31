#!/usr/bin/env python3
"""
Usage:
  python create_worktree.py TOP_LEVEL_DIR BRANCH_NAME
  python create_worktree.py TOP_LEVEL_DIR AGENT_NAME [--subtask SUBTASK_ID]

Creates a git worktree on a new branch based on the current branch.

If the second argument looks like a full branch name ending in -YYYYMMDD,
that branch name is used directly.

Otherwise, the second argument is treated as an agent name and the script
builds the branch name from the current branch:
  <current-branch-prefix>-<subtask-id>-<agent-name>-<today>  (if --subtask provided)
  <current-branch-prefix>-<agent-name>-<today>               (otherwise)

If the current branch already ends in -<subtask>-<agent>-<YYYYMMDD>, that suffix is
removed before the new agent/date suffix is appended. The --subtask parameter ensures
consistent subtask organization across all stages for a given subtask.

If TOP_LEVEL_DIR resolves under /mnt/c/Users/.../Documents, the script uses
~/worktrees instead. Git worktrees are unreliable there under WSL.
"""

import argparse
import datetime
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
    parser.add_argument(
        "--subtask",
        dest="subtask",
        default=None,
        help="Subtask identifier (e.g., 'subtask-1') to include in branch name for organization.",
    )
    args = parser.parse_args()

    top_level_dir = args.top_level_dir
    branch_or_agent = args.branch_or_agent

    git("rev-parse", "--show-toplevel")  # verify inside a git repo

    repo_root = git("rev-parse", "--show-toplevel")
    today = datetime.date.today().strftime("%Y%m%d")
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
    else:
        agent_name = branch_or_agent
        require_clean_name(agent_name, "agent name")

        # Remove trailing agent-date suffix if present, accounting for optional subtask
        # Pattern: -<subtask>-<agent>-YYYYMMDD or -<agent>-YYYYMMDD
        branch_prefix = re.sub(r"(?:-[a-zA-Z0-9_.-]+-[a-zA-Z0-9_.-]+|-[a-zA-Z0-9_.-]+)-[0-9]{8}$", "", current_branch)
        if not branch_prefix:
            fail(f"could not derive a branch prefix from current branch '{current_branch}'")

        if args.subtask:
            require_clean_name(args.subtask, "subtask identifier")
            branch_name = f"{branch_prefix}-{args.subtask}-{agent_name}-{today}"
        else:
            branch_name = f"{branch_prefix}-{agent_name}-{today}"

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
