---
name: "artifact-paths"
description: "Resolve and report shared artifact paths as repository-root-relative locations."
---

# Artifact Paths

Use this skill only when an agent must resolve, derive, normalize, reuse, or report an artifact path.

## Shared Rules

- Load this skill only at the point where an artifact path must be resolved or passed forward.

- Treat shared artifact paths as repository-root-relative unless the role explicitly requires otherwise.
- Resolve artifact paths from the current repository root, not from another agent's absolute worktree path.
- Prefer portable artifact paths in prompts and reports rather than worktree-specific absolute paths.
- When deriving a task slug from a task name, remove trailing agent-role suffixes when that behavior matches the role's workflow.

## Defaults

- Task-level workflows typically default to `artifacts/<task-slug>`.
- Feature-level or plan-level workflows may use a broader artifact directory when defined by the governing workflow.

## Limits

- Keep role-specific artifact filenames inline in the agent definition.
- Keep role-specific artifact layout exceptions inline in the agent definition.
- Do not use this skill to override an explicit artifact path supplied by an upstream agent or plan.
