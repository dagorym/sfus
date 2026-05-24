---
name: "commit-flow"
description: "Run the implementer-specific code-commit then artifact-commit sequence."
---

# Implementer Commit Flow

Load this skill only when implementation changes or required success-path artifacts are ready to be committed.

## Tooling

- Use the colocated tool `validate_commit_scope.py` before committing to verify that changed files stay within the approved file list and that required artifacts are present before the artifact commit.

## Purpose

Use this skill to apply the implementer's exact commit ordering and commit-hash preservation rules.

## Required Sequence

1. Run `validate_commit_scope.py` and confirm the final diff stays within approved scope and files.
2. Confirm acceptance criteria are satisfied.
3. Confirm any remaining failing existing validations are explicitly documented as expected consequences of approved behavior changes rather than unresolved regressions.
4. Create a code-change commit that contains only the approved implementation changes.
5. Capture the resulting implementation/code commit hash immediately after the commit succeeds.
6. Write the required success-path artifacts only after that commit hash has been captured.
7. Re-run `validate_commit_scope.py` with required artifact expectations if needed, then stage and commit the artifact files in a second commit.

## Hash Rules

- Record the implementation/code commit hash in implementer artifact data.
- If no code changes were made, record `"No Changes Made"` instead.
- Do not record the artifact commit hash in the machine-readable artifact data.

## Limits

- Do not combine implementation/code changes and required output artifacts into a single success commit.
- Do not finish a successful run with implementation changes or required output artifacts left uncommitted.
