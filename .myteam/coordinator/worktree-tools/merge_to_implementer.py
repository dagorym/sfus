#!/usr/bin/env python3
"""
Usage:
  python merge_to_implementer.py BRANCH_PREFIX

Finds local branches created from the given prefix using the naming pattern:
  <branch-prefix>-<agent-name>-<YYYYMMDD>

Merge order:
  1. verifier -> documenter
  2. documenter -> testing (or tester)
  3. testing (or tester) -> implementer

After all merges succeed, the script force-removes worktrees for all
downstream agent branches and deletes those branches. The implementer
branch and worktree are preserved so remediation can continue there.
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


def parse_agent_branch(branch, prefix):
    """Returns (agent_name, date) or None."""
    if not branch.startswith(f"{prefix}-"):
        return None
    rest = branch[len(prefix) + 1:]
    m = re.fullmatch(r"(.+)-([0-9]{8})", rest)
    if not m:
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
    current_branch = git("branch", "--show-current")

    if not current_branch:
        fail("detached HEAD is not supported")

    all_branches = git("for-each-ref", "--format=%(refname:short)", "refs/heads").splitlines()
    matching_branches = []
    branch_by_agent = {}

    for branch in all_branches:
        parsed = parse_agent_branch(branch, branch_prefix)
        if parsed is None:
            continue
        agent_name = parsed[0]
        if agent_name in branch_by_agent:
            fail(f"multiple branches found for agent '{agent_name}': {branch_by_agent[agent_name]} and {branch}")
        branch_by_agent[agent_name] = branch
        matching_branches.append(branch)

    if not matching_branches:
        fail(f"no local branches found for prefix '{branch_prefix}'")

    if "testing" in branch_by_agent and "tester" in branch_by_agent:
        fail(f"found both testing and tester branches for prefix '{branch_prefix}'; keep only one naming convention")

    worktree_by_branch = parse_worktrees()

    testing_branch = branch_by_agent.get("testing") or branch_by_agent.get("tester")
    implementer_branch = branch_by_agent.get("implementer")
    verifier_branch = branch_by_agent.get("verifier")
    documenter_branch = branch_by_agent.get("documenter")

    if not implementer_branch:
        fail(f"no implementer branch found for prefix '{branch_prefix}'")
    if not testing_branch and not documenter_branch and not verifier_branch:
        fail(f"no downstream tester/documenter/verifier branches found for prefix '{branch_prefix}'")

    if documenter_branch and not testing_branch:
        fail("found a documenter branch but no testing/tester branch to merge it into")

    if verifier_branch and not documenter_branch:
        fail("found a verifier branch but no documenter branch to merge it into")

    if implementer_branch not in worktree_by_branch:
        fail(f"implementer branch does not have an attached worktree: {implementer_branch}")

    if testing_branch and testing_branch not in worktree_by_branch:
        fail(f"testing branch does not have an attached worktree: {testing_branch}")

    if documenter_branch and documenter_branch not in worktree_by_branch:
        fail(f"documenter branch does not have an attached worktree: {documenter_branch}")

    if verifier_branch and verifier_branch not in worktree_by_branch:
        fail(f"verifier branch does not have an attached worktree: {verifier_branch}")

    removable_branches = [b for b in [verifier_branch, documenter_branch, testing_branch] if b]

    for branch in removable_branches:
        if current_branch == branch:
            fail(f"current branch is '{branch}'; run this script from the implementer worktree, the base checkout, or another non-removal branch")

    implementer_worktree = worktree_by_branch[implementer_branch]

    if verifier_branch:
        merge_into_branch(verifier_branch, documenter_branch, worktree_by_branch[documenter_branch])

    if documenter_branch:
        merge_into_branch(documenter_branch, testing_branch, worktree_by_branch[testing_branch])

    if testing_branch:
        merge_into_branch(testing_branch, implementer_branch, implementer_worktree)

    for branch in removable_branches:
        worktree_path = worktree_by_branch.get(branch)
        if worktree_path:
            note(f"Force-removing worktree {worktree_path}")
            subprocess.run(["git", "worktree", "remove", "--force", worktree_path], check=True)

    for branch in removable_branches:
        note(f"Deleting branch {branch}")
        subprocess.run(["git", "branch", "-D", branch], check=True)

    note(f"Merged downstream agent branches into {implementer_branch} and preserved implementer worktree {implementer_worktree}")


if __name__ == "__main__":
    main()
