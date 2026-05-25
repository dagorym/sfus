---
name: "remediation"
description: "Handle the single allowed Tester-driven or Verifier-driven remediation cycle per subtask."
---

# Coordinator Remediation

Load this skill only when a Tester or Verifier outcome triggers a permitted remediation cycle.

## Tool

- Use the colocated tool `merge_to_implementer.sh` when downstream stage branches must be merged back into the Implementer branch for a remediation cycle.
- Use the colocated tool `archive_stage_artifacts.py` before remediation to archive live artifacts from the failed pass into the subtask history directory.

## Required Actions

- For Tester-driven remediation, first archive the current live Implementer and Tester artifacts under `history/<pass-label>/`, then remove those archived files from the live subtask artifact directory, then merge the Tester branch back into the Implementer branch, preserve the Implementer worktree, and relaunch the Implementer exactly once with a focused remediation preamble.
- For Verifier-driven remediation, first archive the current live Implementer, Tester, Documenter, and Verifier artifacts under `history/<pass-label>/`, then remove those archived files from the live subtask artifact directory, then merge the Verifier, Documenter, and Tester branches back through their parent chain into the Implementer branch, preserve the Implementer worktree, and restart the downstream chain exactly once.
- After archival, treat the subtask artifact directory root as empty for regenerated stage outputs so the remediation pass must recreate the canonical live artifacts for every rerun stage.
- Preserve the original planner-written Implementer prompt and add only the remediation preamble.

## Limits

- At most one Tester-driven remediation cycle per subtask.
- At most one Verifier-driven remediation cycle per subtask.
