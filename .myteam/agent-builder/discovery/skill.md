---
name: "discovery"
description: "Gather creation attributes or requested update deltas before scaffolding or drafting a myteam node."
---

# Agent Builder Discovery

Load this skill after intake establishes the normalized target path, node type, and default drafting path.

## Required Actions

- For create:
  - gather whether the node is a role or skill
  - gather mission/purpose, scope boundaries, responsibilities, workflow, constraints, tool expectations, and communication style as appropriate for that node type
  - gather whether nested parent-path context already exists or must be created
- For update:
  - inspect existing files as needed
  - gather exact sections or behaviors to change
  - gather what must remain unchanged
  - confirm whether only `role.md` or `skill.md` changes are needed or whether `load.py` behavior must also change
- If the request depends on how `myteam` currently scaffolds, loads, or discovers nodes, load `framework-context` and inspect the local `myteam` repo before asking the user to explain framework behavior.
- Ask targeted clarification questions whenever requirements are ambiguous, conflicting, or incomplete.

## Limits

- Do not begin writing before the requested behavior changes are clear enough to propose.
