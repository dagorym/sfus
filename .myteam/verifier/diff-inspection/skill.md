---
name: "diff-inspection"
description: "Inspect the combined implementation, test, and documentation diff and recover the governing evaluation source."
---

# Verifier Diff Inspection

Load this skill only when the verifier must establish the combined review surface and the evaluation basis.

## Tooling

- Use the colocated tool `summarize_review_surface.py` to recover the likely comparison base, changed-file categories, changed line ranges, and candidate files needing deeper inspection before spending tokens on manual diff narration.

## Required Actions

- Review the full combined diff for implementation, test, and documentation changes.
- Identify affected files, control flow, interfaces, configuration, tests, and documentation.
- Use surrounding file context where needed to avoid shallow diff-only conclusions.
- If the exact governing plan or acceptance-criteria source is not explicit, determine the most likely evaluation source from repository and artifact context and label the choice as an assumption.
- If convention files are not explicit, discover relevant repository instruction files and project-local convention files and label the choice as an assumption when needed.
