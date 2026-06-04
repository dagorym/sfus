---
name: "decision-resolution"
description: "Resolve open design or implementation decisions before finalizing the plan."
---

# Planner Decision Resolution

Load this skill only when unresolved design or implementation decisions remain after initial inspection and must be resolved with the user before planning can continue.

## Tooling

- Load the `decision-tracking` shared skill and use its `decision_tracker.py` tool to track the current decision list, resolved decisions, remaining queue, and decision-dependent notes when that bookkeeping would otherwise consume unnecessary context.

## Required Actions

- Present the full list of material decisions that must be made before planning can safely continue.
- Enter a resolution loop and handle each required decision one at a time until the list is resolved or the user stops the process.
- For each decision in the loop:
  - present the decision that must be made
  - present the viable options, each with explicit pros and cons
  - recommend the best option, grounded in information already gathered (codebase context, stated constraints, and known requirements), with explicit rationale for the recommendation
  - ask for the user's decision or approval before finalizing affected subtasks whenever the choice affects user-visible behavior, UX, interfaces, scope, or acceptance criteria
- After each user answer, update the remaining decision set and continue to the next required decision when additional unresolved decisions remain.
- Keep the decision tracker synchronized with resolved and remaining items when the tool is in use.
- Resolve the full required decision set before decomposition or before revising any affected subtasks to final form.

## Limits

- Do not defer unresolved design decisions to the Implementer.
- Do not silently choose among multiple reasonable product or design options when the user has not indicated a preference.
- Do not stop after presenting the decision list if unresolved required decisions still remain.
- Do not let bookkeeping-tool state replace the required user-facing decision discussion.
