---
name: "correctness-review"
description: "Check acceptance-criteria satisfaction, edge cases, and integration risks."
---

# Verifier Correctness Review

Load this skill only when evaluating whether the delivered change satisfies the governing acceptance criteria.

## Required Actions

- Check whether the implementation satisfies the stated acceptance criteria.
- Identify logic defects, missing branches, off-by-one mistakes, incorrect assumptions, and unhandled edge cases.
- Identify integration gaps between changed components.
- Check whether tests validate intended behavior rather than only the happy path.
