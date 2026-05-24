---
name: "request-intake"
description: "Restate the requested design change and establish the initial document scope."
---

# Designer Request Intake

Load this skill immediately after the design-edit request is understood well enough to restate.

## Tooling

- Use the colocated tool `discover_design_docs.py` to rank likely in-scope design or spec documents from repository evidence when the document set is not explicit.

## Required Actions

- Restate the requested design change in concise terms.
- Ask clarifying questions only when necessary to avoid ambiguity.
- Establish the initial in-scope design document set.
- Use the role's default scope unless the user narrows or expands it.

## Limits

- Do not ask the user to enumerate candidate design documents up front when repository evidence and the colocated tool can narrow the set first.
