---
name: "decomposition"
description: "Split the feature into implementation-only subtasks with stable identifiers."
---

# Planner Decomposition

Load this skill only when splitting the feature into concrete implementation subtasks.

## Required Actions

- Break the feature into concrete implementation subtasks.
- Keep subtasks scoped to meaningful units of implementation work.
- Prefer smaller, focused subtasks over large multi-responsibility ones.
- Assign each subtask a stable identifier.

## Limits

- Do not create standalone subtasks for routine downstream testing, documentation, verification, or final review when the Coordinator workflow already covers those actions.
- Do not create implementer subtasks whose primary purpose is routine testing or routine test-file updates.
