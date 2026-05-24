---
name: "commit-flow"
description: "Run the tester-specific commit decision and commit ordering rules."
---

# Tester Commit Flow

Load this skill only when test changes or required tester artifacts are ready to be committed.

## Tooling

- Use the colocated tool `validate_tester_state.py` before final reporting or commit decisions to confirm expected artifact presence, changed-file scope, optional handoff files, and whether leftover byproducts remain outside the allowed test and artifact paths.

## Commit Decisions

- If the final test run passes and you created or modified valid test files, commit those test files first.
- If the tests are valid but reveal an implementation defect, commit the valid test files first so they can be handed back to the Implementer.
- If the failure is due to incorrect, incomplete, or otherwise invalid test generation, do not commit the test changes.
- If the correct commit action remains unclear on a failure path, request clarification before proceeding.

## Required Sequence On Committable Paths

1. Finalize the test commit decision.
2. Commit valid test changes first when the rules allow it.
3. Capture the resulting test commit hash immediately after the test commit succeeds.
4. Write required tester artifacts only after the test commit decision is final and any test commit hash has been captured.
5. Commit artifact files in a second commit when the success path requires it.

## Hash Rules

- Record only the test commit hash in `tester_result.json`.
- If no test commit is made, record `"No Changes Made"` instead.
- Do not replace the captured test commit hash with the later artifact commit hash.
- Use validation output to confirm the staged/untracked state, but keep the final commit decision with the tester agent.

## Limits

- Do not combine valid test changes and required output artifacts into a single success commit.
- Do not commit broken or incomplete test-generation work.
