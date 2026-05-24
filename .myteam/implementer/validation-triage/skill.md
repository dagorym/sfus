---
name: "validation-triage"
description: "Classify validation failures as regressions or expected behavior-change consequences."
---

# Implementer Validation Triage

Load this skill only when a validation or existing test command fails after an implementation change.

## Purpose

Use this skill to decide whether the failure blocks implementation progress or should be documented and handed off because approved behavior intentionally changed.

## Decision Process

1. Identify the exact failing command and the failing assertion, error, or exit condition.
2. Compare the failure against the approved plan and acceptance criteria.
3. Treat the failure as an unintended regression unless repository evidence or the approved plan clearly supports the conclusion that the failure is an expected consequence of intentionally changed behavior.
4. If the failure is an unintended regression:
   - diagnose the smallest viable correction,
   - apply the smallest viable correction in scope,
   - re-run the relevant validation.
5. If the failure is an expected consequence of intentionally changed behavior:
   - do not edit tests merely to make the validation pass unless the approved plan explicitly authorizes implementer-owned test changes,
   - document the expected failure clearly,
   - carry that context forward into the Tester handoff.

## Output Requirements

- State which command failed.
- State whether the failure is classified as a regression or an expected consequence.
- State the evidence used for that classification.
- If the failure is expected, state what the Tester must verify next.

## Limits

- Do not downgrade a regression to an expected failure without explicit plan support or strong repository evidence.
- Do not silently continue after a failed validation without recording the classification.
