---
name: "remediation"
description: "Handle the single allowed Tester-driven or Verifier-driven remediation cycle per subtask."
---

# Coordinator Remediation

Load this skill only when a Tester or Verifier outcome triggers a permitted remediation cycle.

## Tool

- Load skill `coordinator/worktree-tools` to access `merge_to_implementer.py` when downstream stage branches must be merged back into the Implementer branch for a remediation cycle.
  Invoke it as: `python merge_to_implementer.py <BRANCH_PREFIX>` from the coordination base checkout in the repository root, where BRANCH_PREFIX is the subtask's implementer branch name without its `-implementer-<date>` suffix (i.e. `<base>-<subtask>`).
- Use the colocated tool `archive_stage_artifacts.py` before remediation to archive live artifacts from the failed pass into the subtask history directory.
  Invoke it as: `python archive_stage_artifacts.py <artifact-dir> <history-dir> <pass-label> --all` from the failing stage worktree root, with repository-root-relative paths.
  The tool moves every live artifact into `history/<pass-label>/`, fails if there is nothing to archive, and commits the archival on the failing stage branch; that commit is what the merge-back carries to the Implementer branch, and the merge tooling rejects dirty worktrees, so do not skip or defer it.
- Run the archive step in the failing downstream stage worktree that currently contains the complete live artifact set, not in the Implementer worktree.

## Required Actions

- For Tester-driven remediation, first run `archive_stage_artifacts.py` in the Tester worktree so the history additions and live-root removals are committed on the Tester branch, then merge the Tester branch back into the Implementer branch, preserve the Implementer worktree, and relaunch the Implementer exactly once with a focused remediation preamble.
- For Verifier-driven remediation, first run `archive_stage_artifacts.py` in the Verifier worktree so the history additions and live-root removals are committed on the Verifier branch, then merge the Verifier, Documenter, and Tester branches back through their parent chain into the Implementer branch, preserve the Implementer worktree, and restart the downstream chain exactly once.
- After archival completes, confirm the failing stage worktree is clean (`git status`) before invoking `merge_to_implementer.py`; an uncommitted archive aborts the merge.
- After archival, rely on the downstream-to-Implementer merge to carry both the `history/<pass-label>/` files and the live-root removals back to the Implementer branch.
- After that merge, treat the subtask artifact directory root as empty for regenerated stage outputs so the remediation pass must recreate the canonical live artifacts for every rerun stage.
- Preserve the original planner-written Implementer prompt and add only the remediation preamble.

## Limits

- At most one Tester-driven remediation cycle per subtask.
- At most one Verifier-driven remediation cycle per subtask.
