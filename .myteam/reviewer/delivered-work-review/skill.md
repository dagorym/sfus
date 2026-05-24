---
name: "delivered-work-review"
description: "Inspect upstream artifacts, reports, and delivered changes across subtasks."
---

# Reviewer Delivered Work Review

Load this skill only when inspecting the delivered work across the relevant subtasks.

## Tooling

- Use the colocated tool `summarize_feature_review_surface.py` to aggregate upstream result artifacts, changed-file lists, commands, commits, verifier verdict metadata, and candidate high-signal files before opening raw artifacts one by one.

## Required Actions

- Review combined Implementer, Tester, and Documenter outputs across relevant subtasks.
- Review Verifier reports, findings, verdicts, and test sufficiency assessments.
- Use surrounding file and artifact context where needed to avoid shallow conclusions.
