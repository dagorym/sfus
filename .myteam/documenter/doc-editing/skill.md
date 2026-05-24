---
name: "doc-editing"
description: "Choose the right documentation targets and apply minimal documentation-only changes."
---

# Documenter Doc Editing

Load this skill only when deciding which docs to update or create, whether repository-required in-code documentation updates are needed, or when actively editing documentation.

## Decision Rules

- Update existing docs when the behavior belongs in documentation that already exists.
- Create a new file under `docs/` only when the implementation introduces a concept not already covered.
- Skip documentation for trivial fixes or minor refactors unless documented behavior changed.
- Preserve existing terminology and avoid creating parallel sources for the same fact.
- When repository guidance requires in-code documentation, treat affected function comments, docblocks, docstrings, and file headers as part of documentation scope.
- Prefer updating existing in-code documentation on changed declarations or interfaces rather than creating parallel explanation in external docs when the repository guidance expects the documentation to live in code.

## Editing Rules

- Make minimal, targeted documentation edits.
- Document the implemented behavior, interfaces, constraints, and usage that are now true.
- Remove or adjust outdated statements that conflict with the implemented behavior.
- When repository guidance requires it, update in-code documentation comments in changed product files with comment-only edits.
- Do not change executable logic or test logic while updating in-code documentation.

## Validation Rules

- Re-read changed docs for accuracy against the actual diff.
- Re-read changed in-code comments for accuracy against the actual diff and applicable repository guidance.
- Check for duplicated facts across files.
- Confirm edits remain within story scope and are documentation-only, including comment-only edits inside product files.
