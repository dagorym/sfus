---
name: "model-selection"
description: "Resolve downstream model and reasoning-effort settings from repository config or bundled coordinator defaults."
---

# Coordinator Model Selection

Load this skill immediately after plan intake and before branch selection or any downstream agent launch planning.

## Required Actions

- Check for a repository-local `config/subagent-models.yaml` file.
- If that file exists, treat it as the source of truth for downstream model and reasoning-effort selection.
- If that file does not exist, use the bundled fallback file `default-subagent-models.yaml` colocated with this skill.
- Resolve `model` and `reasoning_effort` settings by downstream role name for every planned downstream launch.
- Preserve the selected model source path in coordination state so later launches and reporting can cite the exact source used.

## Constraints

- Do not infer model or reasoning-effort values when either the repository-local file or the bundled fallback file provides an explicit mapping.
- Do not rewrite or normalize role names during lookup beyond matching the downstream role ids used by the coordinator workflow.
- Do not prefer the bundled fallback over a repository-local `config/subagent-models.yaml` file when that file exists.
