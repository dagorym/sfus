---
name: "review-artifacts"
description: "Write and commit required review artifacts while staying read-only for files under review."
---

# Review Artifacts

Use this skill only when a review-stage agent has reached the point where it must prepare, write, or report required review artifacts while remaining read-only for repository content under review.

## Shared Rules

- Load this skill only when the role is preparing or writing its required review artifacts.

- Keep project files under review read-only unless the role explicitly allows artifact writing.
- Write only the required review artifact files.
- Treat machine-readable result files as the source of truth for review status when the role defines one.
- Keep stdout aligned with the committed human-readable review report.
- Commit the required review artifact files after writing them.

## Applies To

- verifier-style review roles
- reviewer-style feature review roles

## Limits

- Keep role-specific verdict rules, finding severities, artifact filenames, and reporting formats inline in the agent definition.
- Keep role-specific exception handling inline.
