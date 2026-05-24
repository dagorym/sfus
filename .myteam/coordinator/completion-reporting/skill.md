---
name: "completion-reporting"
description: "Report subtask, branch, artifact, remediation, and final reviewer outcomes."
---

# Coordinator Completion Reporting

Load this skill only when the coordination run is ready to be summarized for the user.

## Required Actions

- Report the status of every subtask, including stage reached, remediation usage, branch merges, and artifact directory.
- Report whether any planned parallelism was downgraded to serial execution.
- Report the resolved coordination base branch and confirm the repository was left on that branch.
- Report the final Reviewer outcome and artifact location.
