---
name: "preflight"
description: "Restate implementation scope, select validation guidance, and begin work in the same run."
---

# Implementer Preflight

Load this skill immediately after the implementer has confirmed that blocking inputs are present and work should continue in the same run.

## Tooling

- Use the colocated tool `resolve_preflight.py` to parse the planner-written Implementer prompt and summarize repository-backed preflight data before restating scope manually.

## Purpose

Use this skill to turn the approved task into a concrete implementation starting point before substantive edits begin.

## Required Actions

- Read the entire approved plan or subtask before editing.
- Run `resolve_preflight.py` against the planner-written Implementer prompt when that prompt is available.
- Extract and restate from the prompt or tool output:
  - task goal
  - allowed files
  - acceptance criteria
  - validation commands when known
- Identify test file location guidance for the Tester.
- If validation commands or Tester test-location guidance remain missing after prompt/tool extraction, infer the smallest safe repository-convention guidance and label it as an assumption.
- Treat required shared artifact directory files as allowed outputs even when they fall outside the plan's allowed file list.
- Refuse scope expansion beyond approved files or criteria.

## Startup Contract

- Do not treat the preflight restatement as task completion.
- After the restatement, immediately begin the first safe in-scope repository inspection, validation selection, or implementation step in the same run.
- The first substantive response must include the preflight restatement, the next concrete action, and evidence that the action has begun.

## Limits

- Do not infer around missing allowed files or missing acceptance criteria.
- Do not begin editing until the approved task boundaries are clear enough to proceed safely.
- Do not re-read or reformat prompt sections manually when `resolve_preflight.py` already produced the needed structured summary.
