---
name: "plan-validation"
description: "Validate the assembled plan and implementer prompts against the planner contract before completion."
---

# Planner Plan Validation

Load this skill only when the assembled plan content and implementer prompt blocks are ready for final contract validation.

## Tooling

- Use the colocated tool `plan_lint.py` to validate required sections, subtask identifiers, prompt completeness, completion-gate presence, documentation-impact sections, and obvious contract violations.

## Required Actions

- Run the colocated lint tool against the final assembled plan content before completion.
- Review reported violations and correct deterministic or clearly planner-authored issues before finishing.
- Surface remaining blockers explicitly when the lint result reveals a plan-quality issue that requires user clarification or planner judgment.
- Finish only when the plan satisfies the linted structural contract and still reflects the intended feature scope.

## Limits

- Do not treat lint success as a substitute for planning judgment.
- Do not ignore deterministic contract violations that the tool reports.
- Do not let the lint tool force substantive design, decomposition, or dependency choices.
