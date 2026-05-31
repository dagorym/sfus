---
name: "merge-and-cleanup"
description: "Merge successful stage chains back into the coordination branch and clean up workflow state."
---

# Coordinator Merge And Cleanup

Load this skill only when a subtask chain has completed successfully or stale worktrees must be removed.

## Tool

- Load skill `coordinator/worktree-tools` to access `merge_worktrees.py` when the successful stage chain must be merged back into the coordination branch and the merged worktrees should be cleaned up together.

## Required Actions

- Merge stage branches back through their parent branches until the Implementer branch is merged into the coordination base branch.
- Preserve archived failed-pass artifacts under the subtask history directory while ensuring the live subtask artifact directory contains only the latest completed Implementer, Tester, Documenter, and Verifier outputs.
- Clean up merged worktrees and branches after successful merge-back.
- After remediation merge-back, clean up stale downstream worktrees while preserving the Implementer worktree when required.
