---
name: "agents-root"
description: "Root myteam entrypoint for the translated roles and shared skills in this repository."
---

# Agents Repository Myteam Root

This `.myteam/` tree is the active role and skill system for this repository.

## How To Work Here

- Load the role you have been assigned with `myteam get role <role>`.
- Load a skill with `myteam get skill <skill>` whenever your role's instructions say to load it.
- Treat `AGENTS.md` as bootstrap-only startup guidance.
- Treat loaded `myteam` role and skill content as the operative repository policy and as first-class instructions.
- Keep changes narrow unless the task explicitly calls for a broader rewrite.
- When editing active instruction definitions, keep the relevant `.myteam` nodes aligned with the workflow and discovery rules they participate in.

## Available Role Mapping

The translated roles mirror the existing repository roles:
- `agent-builder`
- `coordinator`
- `designer`
- `documenter`
- `implementer`
- `planner`
- `reviewer`
- `security`
- `tester`
- `verifier`

## Available Shared Skills

The translated shared skills mirror the existing repository skill bundles:

Load any of these by its bare name with `myteam get skill <skill-name>` (for example `myteam get skill artifact-paths`). They live at the top level of the `.myteam` tree, so they are never prefixed with a role name. Role-specific child skills, by contrast, are nested and loaded with the role prefix: `myteam get skill <role-name>/<child-skill-name>`.

- `agent-editing-governance`
- `approval-gated-editing`
- `artifact-paths`
- `coordinator-context-anchor`
- `decision-tracking`
- `diff-first-editing`
- `execution-start`
- `handoff-prompt-contract`
- `repository-inference`
- `review-artifacts`
- `two-commit-artifact-flow`
