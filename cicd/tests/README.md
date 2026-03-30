# CI/CD Test System

This directory contains CI/CD contract checks for the Linux-oriented workflow.

The supported CI/CD entrypoints for this repository are:

- `.github/workflows/ci.yml` for the GitHub Actions CI shim that delegates to `cicd/scripts/run-validations.sh` with `cicd/config/validation-config.yml`
- `bash cicd/scripts/run-validations.sh` for the production validation runner
- `bash cicd/scripts/build-images.sh` for the shared local image build runner
- `bash cicd/tests/run-validations.sh` for Linux-native CI/CD contract coverage

The test coverage in this directory focuses on shared CI/CD config contracts such as the Linux-only validation command shape, required config file locations, and image-matrix behavior, along with runner success and failure semantics.

## Setup

1. Use Linux.
2. Work from the repository root or the relevant isolated worktree root.
3. No extra dependencies are required beyond the repository's Bash-based scripts and standard Linux command-line tools.

You can verify the supported validation runner with:

```bash
bash cicd/scripts/run-validations.sh
```

You can verify the shared image build runner with:

```bash
bash cicd/scripts/build-images.sh
```

## Running the tests

Run the Linux-native CI/CD contract tests from the worktree or repository root:

```bash
bash cicd/tests/run-validations.sh
```

## Current coverage

- `bash cicd/scripts/run-validations.sh`: canonical Linux validation runner
- `bash cicd/scripts/build-images.sh`: reads `cicd/config/image-matrix.yml`, treats `build` and `validation` as active image-build operations, warns and exits successfully when `images: []`, reserves `publish` and `deploy` as gated warning-only no-op stages, and fails when images are configured but `docker` is unavailable
- `bash cicd/tests/build-images.sh`: validates configured image parsing and build invocation, the `validation` alias, strict-parent-shell (`bash -e`) compatibility, empty-matrix warning-only success, publish/deploy gate behavior, invalid-operation failure, and docker-unavailable failure behavior
- `bash cicd/tests/run-containers.sh`: validates action aliases, optional custom compose-file argument handling, warning-only no-service success, missing compose-file failure, docker-required behavior when services exist, and service detection for inline-map, inline-map-with-trailing-comment, plus non-fixed-indentation `services` layouts
- `bash cicd/tests/run-validations.sh`: validates that shared validation checks live under `cicd/config/validation-config.yml` and use the Linux-only `command` field
- `bash cicd/tests/run-validations.sh`: validates that `.github/workflows/ci.yml` stays a thin shim with `push`/`pull_request` triggers on `main`, `workflow_dispatch`, and `cicd/` references limited to `cicd/scripts` and `cicd/config`
- `bash cicd/tests/run-validations.sh`: validates that image targets live under `cicd/config/image-matrix.yml`
- `bash cicd/tests/run-validations.sh`: validates that image targets live under `cicd/config/image-matrix.yml`, that publish/deploy stay disabled by default there, and that `.github/workflows/cd.yml` remains a manual-dispatch shim over only `cicd/scripts/build-images.sh` plus `cicd/config/image-matrix.yml` while documenting the future Docker Hub input, secret, login-location, and image-naming contract without enabling login or push behavior
- `bash cicd/tests/run-validations.sh`: invokes `bash cicd/tests/build-images.sh` so the shared validation coverage includes the image build runner contract
- `bash cicd/tests/run-validations.sh`: invokes `bash cicd/tests/run-containers.sh` so shared validation coverage includes the local container runner scaffold behavior
- `bash cicd/tests/run-validations.sh`: validates default-run success, warning-only success, GitHub Actions `::warning::...` annotation output only when `GITHUB_ACTIONS=true`, missing-config failure, and strict missing-command failure
