---
name: "merge-and-cleanup"
description: "Merge successful stage chains back into the coordination branch and clean up workflow state."
---

# Coordinator Merge And Cleanup

Load this skill only when a subtask chain has completed successfully or stale worktrees must be removed.

## Tool

- Load skill `coordinator/worktree-tools` to access `merge_worktrees.py` when the successful stage chain must be merged back into the coordination branch and the merged worktrees should be cleaned up together.
  Invoke it as: `python merge_worktrees.py <BRANCH_PREFIX>`
  - BRANCH_PREFIX is the coordination base branch name (e.g. `plan-myfeature`); all stage branches follow the pattern `<BRANCH_PREFIX>-<agent>-<date>`.
  - Run this script from the coordination base branch in the repository root. The script merges the implementer branch into whatever branch is currently checked out at the repo root — running from a stage worktree silently merges into the wrong branch.

## Required Actions

- Before invoking `merge_worktrees.py`, confirm via `stage-validation` that the Verifier branch is clean and all artifacts are committed; the script will abort mid-chain or silently discard work if any stage worktree is dirty.
- From the coordination base branch in the repository root, invoke `python merge_worktrees.py <BRANCH_PREFIX>` to merge the full verifier → documenter → tester → implementer → coordination base chain and remove all stage worktrees and branches.
- After `merge_worktrees.py` completes, verify that the coordination base branch now contains the expected artifact files from all stages before treating the subtask merge as successful.
- Merge stage branches back through their parent branches until the Implementer branch is merged into the coordination base branch.
- Preserve archived failed-pass artifacts under the subtask history directory while ensuring the live subtask artifact directory contains only the latest completed Implementer, Tester, Documenter, and Verifier outputs.
- Clean up merged worktrees and branches after successful merge-back.
- After remediation merge-back, clean up stale downstream worktrees while preserving the Implementer worktree when required.
