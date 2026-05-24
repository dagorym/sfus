---
name: "two-commit-artifact-flow"
description: "Commit substantive work before writing and committing required artifact files."
---

# Two-Commit Artifact Flow

Use this skill only when a role has reached a success path that requires both substantive repository changes and required report or handoff artifacts.

## Shared Rules

- Load this skill only after the role has reached the commit-and-artifact phase where the two-commit sequence is actually required.

- Commit substantive work first.
- Capture the substantive commit hash before writing required artifact files.
- Write required artifact files only after the substantive commit decision is final.
- Commit artifact files in a second commit.
- Preserve the substantive commit hash in machine-readable artifact data rather than replacing it with the later artifact commit hash.

## Applies To

- implementation flows with handoff artifacts
- testing flows with result artifacts
- documentation flows with handoff artifacts

## Limits

- Do not use this skill for read-only review roles that only commit artifacts.
- Keep role-specific exceptions, commit conditions, and artifact schemas inline in the agent definition.
- Keep failure-path commit behavior inline when it differs by role.
