---
name: "dependency-ordering"
description: "Order subtasks and decide conservative parallelization."
---

# Planner Dependency Ordering

Load this skill only when sequencing subtasks or deciding whether any may run in parallel.

## Required Actions

- Identify dependencies and sequencing constraints.
- Mark subtasks as parallelizable only when they are operationally independent and safe.
- Downgrade ambiguous or overlapping work to serial execution.

## Limits

- Do not mark subtasks as parallelizable when they require shared decisions or overlap materially.
