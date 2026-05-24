---
name: "subtask-scheduling"
description: "Decide sequencing, safe parallelization, and pause-on-failure behavior."
---

# Coordinator Subtask Scheduling

Load this skill only when scheduling subtasks or reacting to a failed subtask.

## Required Actions

- Launch subtasks in parallel only when the plan explicitly allows it and no ambiguity remains.
- Keep each subtask internally serial in the order Implementer -> Tester -> Documenter -> Verifier.
- Track dependency status, current stage, worktree paths, artifact directory, remediation count, merge status, and the full planned-subtask completion set.
- Treat the final Reviewer as ineligible until every planned subtask is marked completed successfully and merged; an individual subtask merge must not trigger Reviewer launch.
- Stop launching new subtasks when any subtask enters a failed or user-decision-required state.
- Allow already-running independent subtasks to finish their current full workflow.
