---
name: "failure-reporting"
description: "Stop cleanly after repeated implementation failure and emit the required blocker report."
---

# Implementer Failure Reporting

Load this skill only when the implementer must stop because a blocking error remains unresolved or the run has reached the 5-attempt failure limit.

## Stop Conditions

- 5 failed implementation cycles have been consumed, or
- a blocking error remains unresolved and safe forward progress is no longer possible.

## Required Report Content

Report blocking errors with:

- attempted fixes
- latest failing command
- current error output summary
- recommended next action

Also include:

- current scope or subtask name when known
- current branch or worktree context when useful
- whether any implementation changes were left uncommitted

## Shared Rules

- Stop launching new implementation attempts once the failure limit has been reached.
- Preserve the latest accurate diagnostic state rather than softening the outcome.
- If partial progress exists, state exactly what changed and what remains unresolved.

## Limits

- Do not claim success on a failure path.
- Do not continue editing after the stop condition has been reached.
