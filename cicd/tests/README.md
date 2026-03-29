# CI/CD Test System

This directory contains CI/CD contract checks for the Linux-oriented workflow.

The supported validation entrypoints for this repository are:

- `bash cicd/scripts/run-validations.sh` for the production validation runner
- `bash cicd/tests/run-validations.sh` for Linux-native CI/CD contract coverage

The test coverage in this directory focuses on shared CI/CD config contracts such as the Linux-only validation command shape, required config file locations, and expected empty-matrix behavior, along with runner success and failure semantics.

## Setup

1. Use Linux.
2. Work from the repository root or the relevant isolated worktree root.
3. No extra dependencies are required beyond the repository's Bash-based scripts and standard Linux command-line tools.

You can verify the supported validation runner with:

```bash
bash cicd/scripts/run-validations.sh
```

## Running the tests

Run the Linux-native CI/CD contract tests from the worktree or repository root:

```bash
bash cicd/tests/run-validations.sh
```

## Current coverage

- `bash cicd/scripts/run-validations.sh`: canonical Linux validation runner
- `bash cicd/tests/run-validations.sh`: validates that shared validation checks live under `cicd/config/validation-config.yml` and use the Linux-only `command` field
- `bash cicd/tests/run-validations.sh`: validates that image targets live under `cicd/config/image-matrix.yml`
- `bash cicd/tests/run-validations.sh`: validates that an empty image list is explicitly supported
- `bash cicd/tests/run-validations.sh`: validates default-run success, warning-only success, missing-config failure, and strict missing-command failure
