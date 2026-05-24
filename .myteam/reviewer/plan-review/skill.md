---
name: "plan-review"
description: "Extract feature goals, subtasks, dependencies, and acceptance criteria from the governing plan."
---

# Reviewer Plan Review

Load this skill only when reading the governing feature plan.

## Tooling

- Use the colocated tool `extract_plan_review_context.py` to recover plan structure, likely subtasks, acceptance criteria, dependency hints, and cross-subtask validation candidates from general markdown before doing deeper manual interpretation.

## Required Actions

- Extract the feature goals, subtasks, dependencies, acceptance criteria, and explicit non-functional expectations.
- Identify items that require cross-subtask validation.
- If the exact plan path is not explicit, determine the most likely governing plan from repository and artifact context and label the choice as an assumption.
