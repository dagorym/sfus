---
name: "agent-editing-governance"
description: "Preserve `.myteam` source-of-truth nodes and consistent discovery behavior during instruction edits."
---

# Agent Editing Governance

Use this skill only when `.myteam` role or skill work has reached a step that changes or validates instruction nodes in this repository.

## Shared Rules

- Load this skill when `.myteam` role or skill changes must be scaffolded, finalized, or validated.
- Keep `AGENTS.md` bootstrap-only when this repository is using the `myteam` flow. Put repository-specific instruction policy in the relevant `myteam` role or skill files instead of rebuilding a monolithic `AGENTS.md`.
- Treat `.myteam/<path>/role.md` or `.myteam/<path>/skill.md` plus the colocated `load.py` as the active source-of-truth node for that instruction path.
- When updating an existing node, inspect the node's instruction file and `load.py`, and inspect parent nodes when nested-path discovery depends on them.
- Preserve normal `myteam` discovery behavior unless the user explicitly requests a loader change.
- Preserve the existing direct, procedural, constraint-heavy writing style.
- Keep path segments and file names in lower kebab case unless the user explicitly requests a rename.
- Do not introduce new top-level directories or support files unless the task requires them.
- Prefer minimal diffs over broad rewrites unless a rewrite is explicitly requested.

## Shared Skill Rules

- Store shared `myteam` skills as `.myteam/<skill-path>/skill.md` with the standard `myteam` loader structure.
- Use lower-kebab-case for skill directory names.
- Extract only stable, genuinely shared behavior into skills.
- Keep role-specific mission, approval gates, hard constraints, escalation rules, commit rules, artifact requirements, and required handoff outputs inline when omission would change runtime behavior.
- Keep shared-skill references and terminology aligned across the active `.myteam` instructions that depend on them.

## Verification

- Verify each changed `.myteam` node still has the correct instruction file for its type and a working `load.py`.
- Verify nested-path edits did not break parent-node discovery expectations.
- If shared-skill references changed, verify affected active instruction files still use the same names and load-trigger intent consistently.

## Limits

- Do not use this skill to justify partial updates that leave agent files out of sync.
