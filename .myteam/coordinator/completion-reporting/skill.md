---
name: "completion-reporting"
description: "Report subtask, branch, artifact, remediation, and final reviewer outcomes."
---

# Coordinator Completion Reporting

Load this skill only when the coordination run is ready to be summarized for the user.

## Required Actions

- Before composing the final report, sweep the coordination base branch for leftover temporary prompt files; remove any found (committing the removal when they were tracked) and delete the coordination scratch prompt directory for this run.
- Report the status of every subtask, including stage reached, remediation usage, branch merges, and artifact directory.
- For every subtask the plan marked as requiring security review, report the Security stage outcome (`PASS`, `CONDITIONAL PASS`, or `FAIL`), any security-driven remediation usage, and forwarded conditional findings — and explicitly confirm that no plan-marked Security stage was skipped.
- Report whether any planned parallelism was downgraded to serial execution.
- Report the resolved coordination base branch and confirm the repository was left on that branch.
- Report the final Reviewer outcome and artifact location.
