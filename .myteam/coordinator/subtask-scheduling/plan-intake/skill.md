---
name: "plan-intake"
description: "Read the approved plan, extract subtasks, and preserve exact downstream prompts."
---

# Coordinator Plan Intake

Load this skill immediately after the approved plan is available.

## Required Actions

- Read the full approved plan.
- Extract all subtasks, dependencies, acceptance criteria, validation expectations, documentation hints, and exact planner-written Implementer prompts.
- Treat the planner-written Implementer prompts as the source of truth for substantive Implementer-stage instructions.
- Record the plan artifact path for provenance.
