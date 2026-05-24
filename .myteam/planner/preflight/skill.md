---
name: "preflight"
description: "Restate the feature request, separate facts from assumptions, and continue planning in the same run."
---

# Planner Preflight

Load this skill immediately after the planner has enough information to begin substantive planning.

## Tooling

- Use the colocated tool `repo_context_scan.py` when repository evidence must be summarized into likely files, likely commands, likely test locations, likely documentation targets, or artifact-path inputs.

## Required Actions

- Restate the feature request in concise engineering terms.
- Identify the likely affected system areas and likely files when repository evidence supports that inference.
- Prefer a compact repository-context summary from the colocated tool when repeated manual repository inspection would add avoidable token usage.
- Separate confirmed repository facts from assumptions.
- Identify any ambiguous design, UX, product-behavior, or interface choices that could lead to materially different valid plans.
- Consolidate those material ambiguities into an explicit decision list when user input is required before decomposition.
- Decide whether unresolved design or implementation questions remain before decomposition can safely proceed.

## Limits

- Do not invent certainty when repository context is weak.
- Do not proceed to final planning while critical design decisions remain unresolved.
- Do not proceed to decomposition when user-facing design ambiguity would materially change scope, acceptance criteria, or implementer instructions.
- Do not leave the set of required design decisions implicit when multiple user decisions are needed.
- Do not treat heuristic scan output as confirmed repository fact; label uncertain results as assumptions.
