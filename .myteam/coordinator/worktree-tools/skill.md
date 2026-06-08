---
name: "worktree-tools"
description: "Shared coordinator scripts for creating stage worktrees and merging stage chains."
---

# Coordinator Worktree Tools

Shared scripts used by the `stage-launches`, `merge-and-cleanup`, and `remediation` coordinator skills. Load this skill when the tool instructions in those skills direct you to do so.

## Tools

- `create_worktree.py` — creates a git worktree on a new branch following the `<base>-<subtask>-<stage>-<date>` naming convention.
  Branching off a non-stage branch (Implementer, final Reviewer): pass the full branch name:
  `python create_worktree.py <TOP_LEVEL_DIR> <FULL_BRANCH_NAME>`
  Branching off a stage branch (Tester, Documenter, Security, Verifier): pass the next agent name; the script swaps the stage segment and preserves the date:
  `python create_worktree.py <TOP_LEVEL_DIR> <AGENT_NAME> --from-branch <PREVIOUS_STAGE_BRANCH>`

- `merge_worktrees.py` — merges the full verifier→security (when present)→documenter→tester→implementer→current chain, then removes all matching worktrees and branches.
  Invoke as: `python merge_worktrees.py <BRANCH_PREFIX>`, where BRANCH_PREFIX is the implementer branch name without its `-implementer-<date>` suffix (i.e. `<base>-<subtask>`).

- `merge_to_implementer.py` — merges the downstream chain into the implementer branch only, preserving the implementer worktree for remediation.
  Invoke as: `python merge_to_implementer.py <BRANCH_PREFIX>`, with the same BRANCH_PREFIX definition (`<base>-<subtask>`).
