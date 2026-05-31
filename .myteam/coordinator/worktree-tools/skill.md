---
name: "worktree-tools"
description: "Shared coordinator scripts for creating stage worktrees and merging stage chains."
---

# Coordinator Worktree Tools

Shared scripts used by the `stage-launches`, `merge-and-cleanup`, and `remediation` coordinator skills. Load this skill when the tool instructions in those skills direct you to do so.

## Tools

- `create_worktree.py` — creates a git worktree on a new branch derived from the current branch.
  Invoke as: `python create_worktree.py <TOP_LEVEL_DIR> <AGENT_NAME>`

- `merge_worktrees.py` — merges the full verifier→documenter→tester→implementer→current chain, then removes all matching worktrees and branches.
  Invoke as: `python merge_worktrees.py <BRANCH_PREFIX>`

- `merge_to_implementer.py` — merges the downstream chain into the implementer branch only, preserving the implementer worktree for remediation.
  Invoke as: `python merge_to_implementer.py <BRANCH_PREFIX>`
