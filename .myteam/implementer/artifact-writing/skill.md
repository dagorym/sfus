---
name: "artifact-writing"
description: "Write the implementer success-path report, result artifact, and tester prompt files."
---

# Implementer Artifact Writing

Load this skill only on the success path after the implementation/code commit hash has been captured and the shared artifact directory has been resolved.

## Tooling

- Use the colocated tool `write_success_artifacts.py` to render and write the required success-path files from structured input instead of composing those files manually.

## Required Artifacts

Write the following files to the resolved shared artifact directory:

- `implementer_report.md`
  - archival human-readable implementation report
  - same substantive content presented in stdout
- `tester_prompt.txt`
  - complete Tester handoff content
  - omit the heading line `Tester Agent Prompt`
- `implementer_result.json`
  - machine-readable result artifact

## Minimum `implementer_result.json` Fields

- `status`
- subtask or task identifier when available
- branch name
- implementation/code commit hash, or `"No Changes Made"` if no code commit exists
- changed files
- validation commands run
- validation outcome
- artifact file paths written

## Shared Rules

- Resolve the shared artifact directory from caller-provided repository-root-relative guidance when available.
- Otherwise derive repository-root-relative `artifacts/<task-slug>` from the task name.
- If deriving `<task-slug>`, remove trailing agent-role suffixes such as `implementer`, `tester`, and `verifier`.
- Create the resolved shared artifact directory before writing files if it does not already exist.
- Preserve the implementation/code commit hash in artifact data. Do not replace it with the later artifact commit hash.
- Treat the tool output as the canonical file-formatting path for `implementer_report.md`, `tester_prompt.txt`, and `implementer_result.json`.

## Limits

- Do not write success-path artifacts before the implementation/code commit decision is final.
- Do not omit any required artifact from a successful run.
