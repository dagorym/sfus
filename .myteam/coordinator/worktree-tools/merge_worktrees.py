#!/usr/bin/env python3
"""
Usage:
  python merge_worktrees.py BRANCH_PREFIX

BRANCH_PREFIX is the subtask's implementer branch name without its
-implementer-<date> suffix, i.e. <base>-<subtask> under the
<base>-<subtask>-<stage>-<date> naming convention.

Finds local branches named <branch-prefix>-<stage>-<YYYYMMDD> where <stage>
is one of: implementer, tester, documenter, verifier. Branches with any
other trailing segment are ignored, including plan-level reviewer branches.
All matched branches must share the same date (later stages inherit the
Implementer's start date); mixed dates indicate stale branches from an
earlier pass and abort the merge.

Merge order:
  1. verifier -> documenter
  2. documenter -> tester
  3. tester -> implementer
  4. implementer -> current branch

After all merges succeed, the script removes the worktrees for all matched
agent branches and deletes the branches. Removal and deletion are never
forced: a worktree containing uncommitted or untracked files, or a branch
that is not fully merged, aborts cleanup so nothing unmerged is lost.
"""

import re
import subprocess
import sys


def fail(message):
    print(f"Error: {message}", file=sys.stderr)
    sys.exit(1)


def note(message):
    print(message)


def require_clean_prefix(value):
    if not value:
        fail("branch prefix cannot be empty")
    if "/" in value:
        fail("branch prefix cannot contain '/'")
    if not re.fullmatch(r"[A-Za-z0-9._-]+", value):
        fail("branch prefix may only contain letters, numbers, dot, underscore, and hyphen")


CHAIN_STAGES = {"implementer", "tester", "documenter", "verifier"}


def parse_agent_branch(branch, prefix):
    """Returns (stage_name, date) or None.

    Matches only <prefix>-<stage>-<YYYYMMDD> where <stage> is a known chain
    stage; anything else (including plan-level reviewer branches) is ignored.
    """
    if not branch.startswith(f"{prefix}-"):
        return None
    rest = branch[len(prefix) + 1:]
    m = re.fullmatch(r"([A-Za-z0-9_.]+)-([0-9]{8})", rest)
    if not m or m.group(1) not in CHAIN_STAGES:
        return None
    return m.group(1), m.group(2)


def git(*args, check=True):
    result = subprocess.run(["git"] + list(args), capture_output=True, text=True)
    if check and result.returncode != 0:
        fail(result.stderr.strip() or f"git {' '.join(args)} failed")
    return result.stdout.strip()


def git_at(path, *args, check=True):
    result = subprocess.run(["git", "-C", path] + list(args), capture_output=True, text=True)
    if check and result.returncode != 0:
        fail(result.stderr.strip() or f"git -C {path} {' '.join(args)} failed")
    return result.stdout.strip()


def ensure_clean_worktree(path, label):
    r1 = subprocess.run(["git", "-C", path, "diff", "--quiet"], capture_output=True)
    if r1.returncode != 0:
        fail(f"{label} worktree has unstaged changes: {path}")
    r2 = subprocess.run(["git", "-C", path, "diff", "--cached", "--quiet"], capture_output=True)
    if r2.returncode != 0:
        fail(f"{label} worktree has staged changes: {path}")


def ensure_checked_out_branch(path, expected):
    actual = git_at(path, "branch", "--show-current")
    if actual != expected:
        fail(f"expected '{expected}' to be checked out in {path}, found '{actual}'")


def merge_into_branch(source, target, target_path):
    if not source:
        return
    ensure_checked_out_branch(target_path, target)
    ensure_clean_worktree(target_path, target)
    note(f"Merging {source} into {target}")
    subprocess.run(["git", "-C", target_path, "merge", "--no-edit", source], check=True)


def parse_worktrees():
    output = git("worktree", "list", "--porcelain")
    worktree_by_branch = {}
    current_worktree = None
    for line in output.splitlines():
        if line.startswith("worktree "):
            current_worktree = line[len("worktree "):]
        elif line.startswith("branch refs/heads/"):
            branch = line[len("branch refs/heads/"):]
            worktree_by_branch[branch] = current_worktree
    return worktree_by_branch


def main():
    if len(sys.argv) != 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0 if (len(sys.argv) == 2 and sys.argv[1] in ("-h", "--help")) else 1)

    branch_prefix = sys.argv[1]
    require_clean_prefix(branch_prefix)

    git("rev-parse", "--show-toplevel")  # verify inside a git repo
    repo_root = git("rev-parse", "--show-toplevel")
    current_branch = git("branch", "--show-current")

    if not current_branch:
        fail("detached HEAD is not supported")

    all_branches = git("for-each-ref", "--format=%(refname:short)", "refs/heads").splitlines()
    matching_branches = []
    branch_by_agent = {}
    branch_dates = set()

    for branch in all_branches:
        parsed = parse_agent_branch(branch, branch_prefix)
        if parsed is None:
            continue
        agent_name, branch_date = parsed
        if agent_name in branch_by_agent:
            fail(f"multiple branches found for agent '{agent_name}': {branch_by_agent[agent_name]} and {branch}")
        branch_by_agent[agent_name] = branch
        branch_dates.add(branch_date)
        matching_branches.append(branch)

    if not matching_branches:
        fail(f"no local branches found for prefix '{branch_prefix}'")

    if len(branch_dates) > 1:
        fail(
            f"matched branches have mixed dates ({', '.join(sorted(branch_dates))}); all stages of a "
            f"subtask must share the Implementer's start date — remove stale branches and retry: "
            f"{', '.join(sorted(matching_branches))}"
        )

    for agent in ("implementer", "tester", "verifier", "documenter"):
        branch = branch_by_agent.get(agent)
        if branch and current_branch == branch:
            fail(f"current branch is '{branch}'; run this script from the base branch you want to merge into")

    worktree_by_branch = parse_worktrees()

    tester_branch = branch_by_agent.get("tester")
    implementer_branch = branch_by_agent.get("implementer")
    verifier_branch = branch_by_agent.get("verifier")
    documenter_branch = branch_by_agent.get("documenter")

    if not implementer_branch:
        fail(f"no implementer branch found for prefix '{branch_prefix}'")

    if documenter_branch and not tester_branch:
        fail("found a documenter branch but no tester branch to merge it into")

    if documenter_branch and documenter_branch not in worktree_by_branch:
        fail(f"documenter branch does not have an attached worktree: {documenter_branch}")

    if tester_branch and tester_branch not in worktree_by_branch:
        fail(f"tester branch does not have an attached worktree: {tester_branch}")

    if verifier_branch and not documenter_branch:
        fail("found a verifier branch but no documenter branch to merge it into")

    if verifier_branch and verifier_branch not in worktree_by_branch:
        fail(f"verifier branch does not have an attached worktree: {verifier_branch}")

    if implementer_branch not in worktree_by_branch:
        fail(f"implementer branch does not have an attached worktree: {implementer_branch}")

    implementer_worktree = worktree_by_branch[implementer_branch]

    # Pre-check every matched worktree is clean (including untracked files)
    # before merging or removing anything, so an abort never leaves the merge
    # or cleanup half-done and a re-run starts from an untouched state.
    for branch in matching_branches:
        worktree_path = worktree_by_branch.get(branch)
        if not worktree_path:
            continue
        status = git_at(worktree_path, "status", "--porcelain")
        if status:
            fail(
                f"worktree {worktree_path} contains uncommitted or untracked files:\n{status}\n"
                "Inspect it, commit or clean anything that matters, then re-run this script."
            )

    ensure_checked_out_branch(repo_root, current_branch)
    ensure_clean_worktree(repo_root, current_branch)

    if verifier_branch:
        merge_into_branch(verifier_branch, documenter_branch, worktree_by_branch[documenter_branch])

    if documenter_branch:
        merge_into_branch(documenter_branch, tester_branch, worktree_by_branch[tester_branch])

    if tester_branch:
        merge_into_branch(tester_branch, implementer_branch, implementer_worktree)

    merge_into_branch(implementer_branch, current_branch, repo_root)

    for branch in matching_branches:
        worktree_path = worktree_by_branch.get(branch)
        if worktree_path:
            note(f"Removing worktree {worktree_path}")
            result = subprocess.run(
                ["git", "worktree", "remove", worktree_path],
                capture_output=True, text=True,
            )
            if result.returncode != 0:
                fail(
                    f"could not remove worktree {worktree_path}: {result.stderr.strip()}\n"
                    "The worktree likely contains uncommitted or untracked files. Inspect it, commit or "
                    "clean anything that matters, then re-run this script to finish the merge and cleanup."
                )

    for branch in matching_branches:
        note(f"Deleting branch {branch}")
        result = subprocess.run(["git", "branch", "-d", branch], capture_output=True, text=True)
        if result.returncode != 0:
            fail(
                f"could not delete branch {branch}: {result.stderr.strip()}\n"
                "The branch is not fully merged; verify the merge chain completed before deleting."
            )

    note(f"Merged agent branches into {current_branch} and removed matching worktrees and branches for prefix '{branch_prefix}'")


if __name__ == "__main__":
    main()
