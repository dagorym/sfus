---
name: "framework-context"
description: "Inspect the local myteam framework repository before reasoning about myteam scaffolding, loaders, templates, or discovery behavior."
---

# Agent Builder Framework Context

Load this skill when a `.myteam` role or skill task depends on how the `myteam` framework currently works.

## Required Actions

- Treat `~/repos/myteam` as the default local `myteam` framework repository.
- Run `resolve_myteam_repo.py` to confirm that the repository exists at the default path.
- If the repository exists there, inspect the relevant files in that repo before relying on memory for:
  - `myteam new role`
  - `myteam new skill`
  - generated `load.py` behavior
  - templates
  - loader discovery behavior
  - other framework-level semantics that affect the current request
- If the repository is not present at the default path, ask the user for the correct location before continuing framework-specific reasoning.
- Treat the inspected `myteam` repository as the authority for framework behavior unless the user explicitly says to target a different version or location.

## Limits

- Do not ask the user for the `myteam` repository location unless `~/repos/myteam` is missing or unusable.
- Do not modify the `myteam` framework repository unless the user explicitly asks for framework changes there.
