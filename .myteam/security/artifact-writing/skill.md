---
name: "artifact-writing"
description: "Write and commit security review artifacts with the required outcome metadata."
---

# Security Artifact Writing

Load this skill only when `security_report.md` and `security_result.json` are about to be written and committed.

## Tooling

- Use the colocated tool `write_security_artifacts.py` to render and write the required security report and result artifact from structured input instead of reproducing those file formats manually.

## Required Artifacts

- `security_report.md`
  - full structured specialist security report
- `security_result.json`
  - machine-readable result artifact

## Minimum `security_result.json` Fields

- `status`
- subtask or task identifier when available
- branch name
- pass label
- outcome (`PASS`, `CONDITIONAL PASS`, or `FAIL`)
- blocking finding count
- warning finding count
- note finding count
- test sufficiency summary
- documentation sufficiency summary
- artifact file paths written

## Shared Rules

- Treat these files as explicitly permitted outputs even though the security role is otherwise read-only.
- Stage and commit the required review artifact files after writing them.
- If the final `git add` or `git commit` is blocked only because Git parent worktree metadata crosses a sandbox boundary, rerun the same command with escalated permissions immediately and do not ask the user again.
- Treat tool output as the canonical formatting and consistency path for security artifacts when structured inputs are available.
