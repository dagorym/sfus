---
name: "artifact-writing"
description: "Write tester result artifacts for success and failure paths."
---

# Tester Artifact Writing

Load this skill only when `tester_report.md`, `tester_result.json`, or `documenter_prompt.txt` may need to be written.

## Tooling

- Use the colocated tool `write_tester_artifacts.py` to render and write the required tester report, result artifact, and success-path Documenter prompt from structured input instead of manually reproducing those file formats.

## Required Artifacts

- `tester_report.md`
  - archival human-readable tester report
  - same substantive content presented in stdout
- `tester_result.json`
  - machine-readable result summary
- `documenter_prompt.txt`
  - only on the success path
  - omit the heading line `Documenter Agent Prompt`

## Minimum `tester_result.json` Fields

- `status`
- subtask or task identifier when available
- branch name
- test commit hash when a commit exists, or `"No Changes Made"`
- test files added or modified
- commands run
- pass/fail totals when available
- unmet acceptance criteria when present
- artifact file paths written

## Shared Rules

- Always write machine-readable handoff artifacts to the shared artifact directory and report the same information in stdout as the human-readable log.
- On success, include the written artifact file paths, including `documenter_prompt.txt` and `tester_report.md`.
- On failure, record the failure status, available pass/fail totals, unmet acceptance criteria when present, and omit any claim that `documenter_prompt.txt` was written.
- Treat the tool output as the canonical file-formatting path for tester artifacts.

## Limits

- Do not write a placeholder test commit hash once a real test commit exists.
- Do not omit required artifacts for the path the run actually took.
