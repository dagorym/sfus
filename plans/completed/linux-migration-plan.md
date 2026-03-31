# Linux-Oriented Migration Plan

## Historical Goal

This migration existed to remove the repository's legacy non-Linux CI/CD execution path and standardize the project on Linux-native tooling. The target end state was a single bash-driven workflow that uses forward-slash paths and keeps CI/CD contracts under `cicd/`.

## Current Linux-Only State

- The repository's supported CI/CD execution path is Linux-first and bash-first.
- Validation runs through `bash cicd/scripts/run-validations.sh`.
- CI/CD contract coverage runs through `bash cicd/tests/run-validations.sh`.
- CI/CD config contracts live under `cicd/config/`.
- Targeted docs and plan files now describe only forward-slash paths and bash-oriented commands.
- `.github/workflows/` remains a thin-entrypoint surface when workflow files are added.

## Migration Summary

The cleanup work is complete for the targeted CI/CD migration surface. Earlier planning called out legacy shell-specific scripts, tests, and mixed execution examples as temporary compatibility baggage to remove. The repository now documents only the Linux-native state that remains, preserving the original rationale without treating that cleanup as pending work.

## Scope That Was Migrated

In scope:
- executable CI/CD scripts
- CI/CD test assets
- CI/CD config contracts
- repo docs and plan files that previously described legacy non-Linux behavior

Out of scope:
- unrelated product or application code
- informational files that never encoded executable Windows-specific behavior

## Files Covered By The Migration

- `cicd/scripts/run-validations.sh`
- `cicd/config/validation-config.yml`
- `cicd/tests/README.md`
- `cicd/tests/run-validations.sh`
- `plans/cicd-plan.md`
- `plans/linux-migration-plan.md`

## Canonical Execution Contract

1. Run validation from the repository root with `bash cicd/scripts/run-validations.sh`.
2. Run CI/CD contract coverage from the repository root with `bash cicd/tests/run-validations.sh`.
3. Keep shared CI/CD contracts under `cicd/config/`.
4. Use forward-slash paths and bash-oriented command examples in repo documentation for this migration surface.

## Verification Notes

1. Search the targeted docs and plan files for stale non-Linux execution references or backslash-path examples.
2. Run the available Linux-native validation and CI/CD contract checks on a Linux machine.
3. Confirm that migration documentation describes the Linux-only steady state rather than future Windows cleanup work.

## Notes And Decisions

- Because the real execution environment is Linux, the repository now prefers one canonical implementation path instead of maintaining cross-platform branches for CI/CD execution.
- The validation contract uses bash-oriented commands executed from the repository root.
- Historical references to removed legacy assets should only be kept at a summary level, not as active implementation instructions.
- Future CI/CD expansion should continue the Linux-only model unless project requirements change substantially.
