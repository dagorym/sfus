---
name: "diff-first-editing"
description: "Prefer minimal, localized edits over broad rewrites."
---

# Diff-First Editing

Use this skill only when a role is about to update an existing file and should default to the smallest coherent change rather than rewriting large sections unnecessarily.

## Shared Rules

- Load this skill immediately before preparing or applying edits to an existing file.

- Default to minimal, localized edits.
- Prefer focused diffs over broad rewrites.
- Preserve unaffected structure, terminology, and intent.
- Use a full rewrite only when the user explicitly requests it or when a localized edit cannot satisfy the requested change cleanly.
- Avoid formatting churn, structural drift, or unrelated cleanup while applying the requested change.

## Applies To

- agent-definition editing
- documentation editing
- implementation updates
- test updates when test changes are genuinely required

## Limits

- Keep role-specific scope controls inline in the agent definition.
- Keep role-specific approval gates inline when omission would change behavior.
- Do not use this skill to override an explicit user request for a rewrite.
