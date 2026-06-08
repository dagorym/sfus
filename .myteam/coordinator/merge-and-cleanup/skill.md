---
name: "merge-and-cleanup"
description: "Merge successful stage chains back into the coordination branch and clean up workflow state."
---

# Coordinator Merge And Cleanup

Load this skill only when a subtask chain has completed successfully or stale worktrees must be removed.

## Tool

- Load skill `coordinator/worktree-tools` to access `merge_worktrees.py` when the successful stage chain must be merged back into the coordination branch and the merged worktrees should be cleaned up together.
  Invoke it as: `python merge_worktrees.py <BRANCH_PREFIX>`
  - BRANCH_PREFIX is the subtask's implementer branch name without its `-implementer-<date>` suffix, i.e. `<base>-<subtask>` (e.g. `plan-myfeature-st1`); the subtask's stage branches all follow the pattern `<BRANCH_PREFIX>-<stage>-<date>`. Do not pass the bare `<base>` — with parallel subtasks in flight it matches multiple subtasks' branches and the merge aborts.
  - Run this script from the coordination base branch in the repository root. The script merges the implementer branch into whatever branch is currently checked out at the repo root — running from a stage worktree silently merges into the wrong branch.

## Required Actions

- Before invoking `merge_worktrees.py`, confirm via `stage-validation` that the Verifier branch is clean and all artifacts are committed; the script will abort mid-chain or silently discard work if any stage worktree is dirty.
- From the coordination base branch in the repository root, invoke `python merge_worktrees.py <BRANCH_PREFIX>` to merge the full verifier → security (when present) → documenter → tester → implementer → coordination base chain and remove all stage worktrees and branches.
- After `merge_worktrees.py` completes, verify that the coordination base branch now contains the expected artifact files from all stages before treating the subtask merge as successful.
- If `merge_worktrees.py` aborts, resolve the exact cause it reports (typically a dirty worktree or stale branch) and re-run it; never merge stage branches individually with `git merge` and never remove worktrees or delete branches manually — partial manual merges skip the cleanliness checks and leave stale worktrees and branches behind.
- Merge stage branches back through their parent branches until the Implementer branch is merged into the coordination base branch.
- Preserve archived failed-pass artifacts under the subtask history directory while ensuring the live subtask artifact directory contains only the latest completed Implementer, Tester, Documenter, Security (when run), and Verifier outputs.
- Clean up merged worktrees and branches after successful merge-back.
- After remediation merge-back, clean up stale downstream worktrees while preserving the Implementer worktree when required.
