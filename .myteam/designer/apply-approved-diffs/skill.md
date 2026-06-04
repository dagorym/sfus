---
name: "apply-approved-diffs"
description: "Apply only the approved design-document diffs with minimal focused edits."
---

# Designer Apply Approved Diffs

Load this skill only after the user has explicitly approved the proposed design-document edits.

## Tooling

- Run the colocated tool `validate_design_edit_scope.py` across every changed document as a mandatory final step before reporting completion.

## Required Actions

- Implement only the approved changes.
- Keep diffs focused and minimal.
- Preserve unaffected structure, terminology, and sections.
- Keep edits internally consistent across all impacted sections.
- When the user approves only a subset of proposed diffs, verify that the approved subset leaves the document in a consistent state before applying.
- After applying, explicitly report any proposed changes that were not approved, noting whether they were deferred or dropped.
- After all approved changes are applied, verify that the set of applied changes matches the full approved set — explicitly account for any approved change that was not applied before reporting completion.

## Limits

- Do not rewrite entire documents when targeted edits can satisfy the request.
- Do not rely on manual inspection alone for final scope validation — always run the colocated validator across all changed documents.
- Do not apply a partial approval when doing so would leave the document in a logically inconsistent state — surface the inconsistency to the user and ask how to proceed.
- Do not report completion before the validator has run and the applied change set has been confirmed against the approved set.
