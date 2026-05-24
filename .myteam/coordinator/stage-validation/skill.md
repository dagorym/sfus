---
name: "stage-validation"
description: "Validate downstream stage completion, artifacts, branch cleanliness, and handoff provenance."
---

# Coordinator Stage Validation

Load this skill only when validating a completed stage.

## Required Actions

- Confirm the stage completed successfully or produced the expected handback status.
- Confirm that all required stage outputs and handoff artifacts exist in the shared subtask artifact directory.
- Confirm committed changes and artifacts are committed and the stage branch is clean.
- Capture the exact downstream handoff prompt artifact written by the stage and use it as the source of truth for the next stage.
