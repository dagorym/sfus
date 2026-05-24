---
name: "merge-and-cleanup"
description: "Merge successful stage chains back into the coordination branch and clean up workflow state."
---

# Coordinator Merge And Cleanup

Load this skill only when a subtask chain has completed successfully or stale worktrees must be removed.

## Tool

- Use the colocated tool `merge_worktrees.sh` when the successful stage chain must be merged back into the coordination branch and the merged worktrees should be cleaned up together.

## Required Actions

- Merge stage branches back through their parent branches until the Implementer branch is merged into the coordination base branch.
- Clean up merged worktrees and branches after successful merge-back.
- After remediation merge-back, clean up stale downstream worktrees while preserving the Implementer worktree when required.
