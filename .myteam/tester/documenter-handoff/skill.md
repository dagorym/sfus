---
name: "documenter-handoff"
description: "Compose the success-path Documenter handoff for stdout and documenter_prompt.txt."
---

# Tester Documenter Handoff

Load this skill only when testing has passed and the downstream Documenter prompt is about to be written or reported.

## Tooling

- When the handoff content is ready, use the colocated artifact-writing tool path to render `documenter_prompt.txt` and the stdout prompt block instead of manually reproducing the full prompt template.

## Required Content

The Documenter handoff must include:

- original task summary
- validated acceptance criteria
- implementation branch or worktree context
- all files modified by the Implementer and Tester that may affect documentation review
- test commit hash, or `"No Changes Made"`
- commands executed
- final test outcomes
- likely documentation context
- plan-path or story-context guidance
- comparison-base guidance
- the shared repository-root-relative artifact directory path to reuse
- an instruction to infer missing plan-path, comparison-base, artifact-path, or documentation-convention details from repository context when safe
- an instruction to continue in the same run when blockers are absent
- the explicit completion gate:
  - `Do not report success unless all required artifacts exist and all changes are committed.`

## Stdout And File Contract

- In stdout, present the handoff as a `Documenter Agent Prompt` block.
- In `documenter_prompt.txt`, omit the heading line `Documenter Agent Prompt` and write only the handoff body.
- Start the handoff body with the exact line `Your role is 'documenter'. Your task is as follows:`

## Template

```text
Documenter Agent Prompt
Your role is 'documenter'. Your task is as follows:

Task summary:
- <short implementation and testing summary>

Acceptance criteria validated:
- <AC 1>
- <AC 2>

Implementation branch or worktree context:
- <branch name / worktree path / comparison context>

Files modified by Implementer and Tester to inspect for documentation impact:
- <file path 1>
- <file path 2>
- <file path 3>

Test commit:
- <commit hash or "No Changes Made">

Commands executed:
- <command 1>
- <command 2>

Final test outcomes:
- <summary of pass/fail results and important findings>

Documentation context:
- <likely docs affected>
- <important behavior changes now confirmed by implementation/tests>

Plan and diff context:
- <plan path when known, or story context to use if the exact plan path must be inferred>
- <base branch or commit when known, or the most likely comparison base labeled as an assumption>

Startup behavior:
- If Tester branch/worktree context and enough story and diff context are present, begin documentation work immediately and continue in the same run.
- Infer missing plan-path, comparison-base, artifact-path, or documentation-convention details from repository context when repository evidence is sufficient, and label those choices as assumptions instead of treating them as blockers.
- Do not stop after activation, scope confirmation, documentation discovery, or diff review when documentation work can proceed.

Shared artifact directory:
- <repository-root-relative shared artifact directory path to reuse>

Completion gate:
- Do not report success unless all required artifacts exist and all changes are committed.
```
