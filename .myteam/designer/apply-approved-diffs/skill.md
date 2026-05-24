---
name: "apply-approved-diffs"
description: "Apply only the approved design-document diffs with minimal focused edits."
---

# Designer Apply Approved Diffs

Load this skill only after the user has explicitly approved the proposed design-document edits.

## Tooling

- Use the colocated tool `validate_design_edit_scope.py` before concluding the task when it can mechanically verify changed-file scope, heading preservation, and large-rewrite drift.

## Required Actions

- Implement only the approved changes.
- Keep diffs focused and minimal.
- Preserve unaffected structure, terminology, and sections.
- Keep edits internally consistent across all impacted sections.

## Limits

- Do not rewrite entire documents when targeted edits can satisfy the request.
- Do not rely only on manual inspection for approved-scope checks when the colocated validator can verify them directly.
