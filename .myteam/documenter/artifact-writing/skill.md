---
name: "artifact-writing"
description: "Write documenter result artifacts and preserve the documentation commit hash."
---

# Documenter Artifact Writing

Load this skill only when `documenter_report.md`, `documenter_result.json`, or `verifier_prompt.txt` are about to be written.

## Required Artifacts

- `documenter_report.md`
  - archival human-readable report
  - same substantive `Documenter Report` content presented in stdout
- `documenter_result.json`
  - machine-readable result artifact
- `verifier_prompt.txt`
  - on the success path
  - omit the heading line `Verifier Agent Prompt`

## Required Actions

- Render artifacts through `write_documenter_artifacts.py` whenever the needed report and handoff fields are available as structured data.

## Minimum `documenter_result.json` Fields

- `status`
- subtask or task identifier when available
- branch name
- documentation commit hash
- documentation files added or modified
- artifact file paths written

## Shared Rules

- Write artifacts only after the documentation commit hash has been captured.
- Create the shared artifact directory before writing if it does not already exist.

## Limits

- Do not write a placeholder commit hash once a real documentation commit exists.
- Do not omit required artifacts for the path the run actually took.

## Tools

- `write_documenter_artifacts.py` writes `documenter_report.md`, `documenter_result.json`, and success-path `verifier_prompt.txt` from structured JSON while preserving the documentation commit hash and stdout handoff contract.
