---
name: "commit-flow"
description: "Run the documenter-specific documentation-commit then artifact-commit sequence."
---

# Documenter Commit Flow

Load this skill only when documentation changes or required documenter artifacts are ready to be committed.

## Required Sequence

0. Run `validate_documenter_state.py` before each success-path commit when a deterministic scope or artifact check can catch mistakes early.
1. Commit documentation-only changes first using a descriptive commit message.
2. Capture the resulting documentation commit hash immediately after the commit succeeds.
3. Write required output artifacts only after that documentation commit hash has been captured.
4. Commit artifact files in a second descriptive commit.

## Hash Rules

- Use the documentation commit hash in artifact data.
- Do not replace it with the later artifact commit hash.

## Limits

- Do not combine documentation changes and required output artifacts into a single success commit.
- Do not finish a successful run with documentation changes or required artifacts left uncommitted.

## Tools

- `validate_documenter_state.py` validates changed-file scope for documentation-only or artifact-only phases, checks required artifacts, and verifies that artifact data preserves the documentation commit hash.
