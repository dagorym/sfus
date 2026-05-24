---
name: "artifact-writing"
description: "Choose a unique plan artifact path and write the final <feature-name>-plan.md file."
---

# Planner Artifact Writing

Load this skill only when naming or writing the final plan artifact.

## Tooling

- Use the colocated tool `plan_artifact_init.py` to derive the feature slug, default output directory, unique filename, and optional initial markdown skeleton when that work is purely mechanical.

## Required Actions

- Choose a sensible `<feature-name>` based on the feature being planned.
- If the user did not specify an output directory, default to the top-level `plans` directory.
- Ensure the filename is unique within the target directory.
- Write the same content shown in the direct response to the markdown artifact.

## Limits

- Do not let the artifact-initialization tool change the planner-authored content of the final plan.
