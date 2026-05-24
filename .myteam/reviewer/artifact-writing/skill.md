---
name: "artifact-writing"
description: "Write and commit reviewer artifacts with the final PASS, CONDITIONAL PASS, or FAIL outcome."
---

# Reviewer Artifact Writing

Load this skill only when `reviewer_report.md` and `reviewer_result.json` are about to be written and committed.

## Tooling

- Use the colocated tool `write_reviewer_artifacts.py` to render and write the required reviewer report and result artifact from structured input instead of reproducing those file formats manually.
- Use the colocated tool `validate_reviewer_state.py` before the final artifact commit when a deterministic scope or artifact check can catch mistakes early.

## Required Artifacts

- `reviewer_report.md`
  - final human-readable feature review report
- `reviewer_result.json`
  - machine-readable feature-level summary

## Minimum `reviewer_result.json` Fields

- `status`
- feature or task identifier when available
- branch name
- final outcome (`PASS`, `CONDITIONAL PASS`, or `FAIL`)
- blocking finding count
- warning finding count
- note finding count
- follow-up feature requests when present
- artifact file paths written

## Shared Rules

- Write the required reviewer artifact files in the resolved shared artifact directory.
- Stage and commit only the reviewer artifact files created by the reviewer.
- Treat tool output as the canonical formatting and consistency path for reviewer artifacts when structured inputs are available.
