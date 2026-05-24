---
name: "repository-inference"
description: "Infer bounded missing operational details from repository evidence and label assumptions."
---

# Repository Inference

Use this skill only when a role-defined decision point requires a missing operational detail and repository context may resolve it instead of treating the omission as a blocker.

## Shared Rules

- Load this skill only when a specific missing detail must be resolved from repository evidence.

- Infer missing details only when repository evidence is sufficient for a safe bounded inference.
- Label inferred choices explicitly as assumptions.
- Ask for clarification when the missing detail would materially change scope, risk, file ownership, approval requirements, or output expectations.
- Ask for clarification instead of inferring when the missing detail is a user-facing design or behavior choice with multiple reasonable options.
- Prefer the smallest safe inference rather than a broad or speculative one.

## Typical Inference Targets

- likely file locations
- likely validation commands
- likely test locations
- likely artifact paths
- likely convention files
- likely comparison bases or plan sources

## Limits

- Do not invent certainty when repository evidence is weak.
- Do not infer product, UX, or interface design choices from repository evidence when those choices are still materially ambiguous.
- Do not infer around missing approval, missing scope boundaries, or missing acceptance criteria.
- Keep role-specific inference targets and escalation thresholds inline in the agent definition when they materially affect behavior.
