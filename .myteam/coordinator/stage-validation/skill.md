---
name: "stage-validation"
description: "Validate downstream stage completion, artifacts, branch cleanliness, and handoff provenance."
---

# Coordinator Stage Validation

Load this skill only when validating a completed stage.

## Required Actions

- Confirm the stage completed successfully or produced the expected handback status.
- Confirm that all required stage outputs and handoff artifacts exist in the shared subtask artifact directory.
- Confirm that machine-readable result artifacts in the shared subtask artifact directory match the current stage branch and current pass label when those values are expected for the stage.
- Reject stale first-pass result artifacts when a remediation pass is in progress or has completed.
- Confirm committed changes and artifacts are committed and the stage branch is clean.
- Capture the exact downstream handoff prompt artifact written by the stage and use it as the source of truth for the next stage.
- For a Security stage, require `security_report.md` and `security_result.json`; the Security stage writes no downstream handoff prompt — the Verifier continues from the Documenter's `verifier_prompt.txt`.
