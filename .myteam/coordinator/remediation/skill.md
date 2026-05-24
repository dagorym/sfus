---
name: "remediation"
description: "Handle the single allowed Tester-driven or Verifier-driven remediation cycle per subtask."
---

# Coordinator Remediation

Load this skill only when a Tester or Verifier outcome triggers a permitted remediation cycle.

## Tool

- Use the colocated tool `merge_to_implementer.sh` when downstream stage branches must be merged back into the Implementer branch for a remediation cycle.

## Required Actions

- For Tester-driven remediation, merge the Tester branch back into the Implementer branch, preserve the Implementer worktree, and relaunch the Implementer exactly once with a focused remediation preamble.
- For Verifier-driven remediation, merge the Verifier, Documenter, and Tester branches back through their parent chain into the Implementer branch, preserve the Implementer worktree, and restart the downstream chain exactly once.
- Preserve the original planner-written Implementer prompt and add only the remediation preamble.

## Limits

- At most one Tester-driven remediation cycle per subtask.
- At most one Verifier-driven remediation cycle per subtask.
