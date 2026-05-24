---
name: "handoff-prompt-contract"
description: "Compose downstream handoff prompts with reusable completion-gate and artifact guidance."
---

# Handoff Prompt Contract

Use this skill only when one agent is actively composing a downstream handoff through a prompt artifact or stdout handoff block.

## Shared Rules

- Load this skill only when the handoff prompt or handoff artifact is being prepared.

- Make the handoff prompt complete enough for the downstream agent to continue without another clarification turn when blockers are absent.
- Reuse the shared repository-root-relative artifact directory when one already exists.
- Include enough context for the downstream agent to determine scope, changed files, and next action.
- Include guidance to continue in the same run when required blocking inputs are present.
- Include the explicit completion gate:
  - `Do not report success unless all required artifacts exist and all changes are committed.`

## Typical Handoff Content

- task summary
- relevant acceptance criteria
- relevant changed files
- validation or result context
- shared artifact directory
- startup behavior for the downstream role

## Limits

- Keep role-specific required handoff sections inline in the agent definition.
- Keep exact prompt-opening lines inline when downstream behavior depends on exact wording.
- Do not use this skill as a substitute for role-specific output contracts.
