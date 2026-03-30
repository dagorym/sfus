# Local pipeline usage

This document is the practical local runbook for the current CI/CD scaffold on this computer.

## Working directory

Run all commands from the repository root:

```bash
cd /home/tstephen/repos/sfus
```

The shared scripts assume repository-root execution even when they resolve their own default config paths.

## What exists on this branch

The branch currently provides four local entrypoints:

- `bash cicd/scripts/run-validations.sh cicd/config/validation-config.yml`
- `bash cicd/scripts/build-images.sh cicd/config/image-matrix.yml build`
- `bash cicd/scripts/run-containers.sh start`
- `bash cicd/tests/run-validations.sh`

The GitHub Actions workflows are thin shims over those same shared scripts and config files:

- `.github/workflows/ci.yml` calls `bash cicd/scripts/run-validations.sh cicd/config/validation-config.yml`
- `.github/workflows/cd.yml` calls `bash cicd/scripts/build-images.sh cicd/config/image-matrix.yml` in `build`, `publish`, or `deploy` mode

## Recommended local pass

Run the local pipeline in this order:

```bash
bash cicd/scripts/run-validations.sh cicd/config/validation-config.yml
bash cicd/scripts/build-images.sh cicd/config/image-matrix.yml build
bash cicd/scripts/run-containers.sh start
bash cicd/tests/run-validations.sh
```

That sequence gives you:

1. The production validation runner used by CI
2. The production image runner used by the manual CD workflow
3. The local container scaffold runner
4. The full Bash contract suite that verifies the shared CI/CD behavior

## Expected results today

### 1. Validations

Run:

```bash
bash cicd/scripts/run-validations.sh cicd/config/validation-config.yml
```

Expected result on this branch:

- exit code `0`
- one executed validation: `repo-structure-contract`
- one warning-only skipped validation: `local-parity-contract`
- a summary line ending in:

```text
Validation summary: total=2; executed=1; warnings=1; failures=0
```

The warning is expected because `cicd/config/validation-config.yml` intentionally includes an empty `command` entry while `warn_on_missing_command: true` is enabled.

### 2. Image builds

Run:

```bash
bash cicd/scripts/build-images.sh cicd/config/image-matrix.yml build
```

Expected result on this branch:

- exit code `0`
- warning on stderr:

```text
Warning: no images defined in cicd/config/image-matrix.yml
```

This succeeds because `cicd/config/image-matrix.yml` currently uses `images: []`.

Docker is not required for this exact empty-matrix case. Once real images are added, `docker` becomes required for `build` and `validation` operations.

### 3. Local containers

Run:

```bash
bash cicd/scripts/run-containers.sh start
```

Expected result on this branch:

- exit code `0`
- warning on stderr:

```text
Warning: no services are defined in /home/tstephen/repos/sfus/cicd/docker/compose.dev.yml; nothing to run.
```

This succeeds because `cicd/docker/compose.dev.yml` currently uses `services: {}`.

Docker is not required for this exact no-services scaffold case. Once services are added, the runner requires either `docker compose` or `docker-compose`.

### 4. Full CI/CD contract suite

Run:

```bash
bash cicd/tests/run-validations.sh
```

Expected result on this branch:

- exit code `0`
- `PASS: Image build runner coverage succeeded.`
- `PASS: Container runner coverage succeeded.`
- `PASS: Linux validation coverage succeeded.`

Use this command as the final local verification step after editing CI/CD scripts, config, workflow shims, or CI/CD documentation.

## Local equivalents of the GitHub Actions workflows

### CI local equivalent

The local equivalent of `.github/workflows/ci.yml` is:

```bash
bash cicd/scripts/run-validations.sh cicd/config/validation-config.yml
```

### CD local equivalent

The local equivalent of the build stage in `.github/workflows/cd.yml` is:

```bash
bash cicd/scripts/build-images.sh cicd/config/image-matrix.yml build
```

The current local equivalents of the placeholder later stages are:

```bash
bash cicd/scripts/build-images.sh cicd/config/image-matrix.yml publish
bash cicd/scripts/build-images.sh cicd/config/image-matrix.yml deploy
```

Today, both commands are expected to exit successfully with warnings because publish and deploy are intentionally gated placeholders.

## Optional runner variations

### Validation config path

These are equivalent when run from the repository root:

```bash
bash cicd/scripts/run-validations.sh
bash cicd/scripts/run-validations.sh cicd/config/validation-config.yml
```

### Container actions

These actions are supported:

```bash
bash cicd/scripts/run-containers.sh start
bash cicd/scripts/run-containers.sh run
bash cicd/scripts/run-containers.sh stop
bash cicd/scripts/run-containers.sh status
bash cicd/scripts/run-containers.sh logs
```

`bash cicd/scripts/run-containers.sh` is equivalent to `start`.

You can also target a different compose file:

```bash
bash cicd/scripts/run-containers.sh path/to/compose.dev.yml start
```

## When Docker becomes mandatory

You do not need Docker to reproduce the current warning-only scaffold behavior documented above.

You do need Docker when either of these becomes true:

- `cicd/config/image-matrix.yml` contains one or more real image entries and you run `build` or `validation`
- the selected compose file contains one or more real services

At that point:

- `build-images.sh` requires `docker`
- `run-containers.sh` requires either `docker compose` or `docker-compose`
