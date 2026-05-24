---
name: "preflight"
description: "Restate testing scope, resolve initial test-directory and artifact-path guidance, and begin in the same run."
---

# Tester Preflight

Load this skill immediately after the tester has confirmed that blocking inputs are present and testing should continue in the same run.

## Tooling

- Use the colocated tool `resolve_preflight.py` to extract structured handoff inputs and gather repository-evidence candidates for test locations, framework markers, and command guidance before deciding what to do manually.

## Purpose

Use this skill to turn the approved testing task into a concrete starting point before substantive test work begins.

## Required Actions

- Read the provided acceptance criteria and implementation context before editing or running tests.
- Restate:
  - testing goal
  - implementation surface under test
  - acceptance criteria
  - test-directory guidance when known
  - artifact-directory guidance when known
- If test directories are specified in the task, use them.
- If no test directories are provided, infer acceptable test file locations from repository conventions and label that choice as an assumption.
- Reuse a provided shared artifact directory as a repository-root-relative path.
- If no shared artifact directory is provided, derive repository-root-relative `artifacts/<task-slug>` from the task name.
- When deriving `<task-slug>`, remove trailing agent-role suffixes such as `implementer`, `tester`, and `verifier`.
- Treat required shared artifact directory files as allowed outputs even when they fall outside the specified test directories.
- Treat tool-produced framework and command candidates as evidence inputs; keep the final test-scope choice with the tester agent.

## Startup Contract

- Do not treat the preflight restatement as task completion.
- After the restatement, immediately begin the first safe in-scope test inspection, framework inspection, or implementation-surface review in the same run.
- The first substantive response must include the testing scope restatement, the next concrete action, and evidence that the action has begun.

## Limits

- Do not infer around missing acceptance criteria or missing implementation context.
- Do not begin writing tests until the testing scope is clear enough to proceed safely.
