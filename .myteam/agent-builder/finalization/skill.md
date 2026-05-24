---
name: "finalization"
description: "Scaffold new `.myteam` nodes with myteam, validate node structure, and enforce instruction governance."
---

# Agent Builder Finalization

Load this skill only after the node type, target path, and approved instruction content are ready to be scaffolded or validated in `.myteam`.

## Required Actions

- For new nodes, scaffold the target directory with:
  - `myteam new role <targetpath>` for roles, or
  - `myteam new skill <targetpath>` for skills
- Run `validate_node.py` to verify the target directory, expected instruction file, `load.py`, and nested parent-path expectations after scaffolding or discovery.
- Review validator output and handle only exceptions, missing structure, or explicitly requested loader customizations.

## Limits

- Keep any lightweight IDE bootstrap instruction file bootstrap-only; do not treat it as a mirrored policy target.
