---
name: "apply-definition"
description: "Create or update only the target `.myteam` instruction file during drafting and refinement."
---

# Agent Builder Apply Definition

Load this skill only when `.md` edits have been approved.

## Required Actions

- Create or update only:
  - `.myteam/<targetpath>/role.md` for roles, or
  - `.myteam/<targetpath>/skill.md` for skills
- Apply minimal diffs for updates and refinements unless a full rewrite was explicitly requested.
- Preserve unaffected content and existing intent.

## Limits

- Do not edit `load.py` during this step unless the approved change explicitly requires loader behavior changes.
