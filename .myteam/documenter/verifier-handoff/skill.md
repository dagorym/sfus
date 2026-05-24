---
name: "verifier-handoff"
description: "Compose the success-path Verifier handoff for stdout and verifier_prompt.txt."
---

# Documenter Verifier Handoff

Load this skill only when documentation has succeeded and the downstream Verifier prompt is about to be written or reported.

## Required Content

- original task summary
- acceptance criteria to verify
- implementation branch or worktree context
- all files modified by the Implementer, Tester, and Documenter that may affect verification scope
- commands executed
- final test outcomes when available
- plan-source or evaluation-context guidance
- convention-file guidance
- updated documentation files
- the shared repository-root-relative artifact directory path to reuse
- an instruction that verification must include implementation, tests, and updated docs together
- an instruction to infer missing plan-source, convention-file, or artifact-path details from repository context when safe
- the explicit completion gate:
  - `Do not report success unless all required artifacts exist and all changes are committed.`

## Stdout And File Contract

- In stdout, present the handoff as a `Verifier Agent Prompt` block.
- In `verifier_prompt.txt`, omit the heading line `Verifier Agent Prompt` and write only the handoff body.
- Start the handoff body with the exact line `Your role is 'verifier'. Your task is as follows:`
- Prefer rendering the final handoff through `write_documenter_artifacts.py` from structured fields instead of hand-formatting it when the required data is already available.
