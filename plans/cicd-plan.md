# CI/CD Plan

## Confirmed Inputs
1. CI auto-runs on `main`.
2. CI/CD can be manually triggered for any branch.
3. Image builds are validation-only for now (future Docker Hub publish).
4. Missing validation commands should `warn`.
5. Image list is unknown initially and will be added incrementally.
6. Devs need Linux-local parity for validation and container build/run workflows.

## Assumptions
1. Local run experience should use the same config sources as GitHub Actions.
2. Local container run should be via Docker Compose (or equivalent script wrapper) with safe no-op behavior when no services exist yet.
3. GitHub Actions workflow definitions must remain in `.github/workflows/` as platform-required entrypoints.

## Files To Modify
1. `.github/workflows/ci.yml`
2. `.github/workflows/cd.yml`
3. `cicd/config/validation-config.yml`
4. `cicd/config/image-matrix.yml`
5. `cicd/scripts/run-validations.sh`
6. `cicd/scripts/build-images.ps1`
7. `cicd/scripts/build-images.sh`
8. `cicd/scripts/run-containers.ps1`
9. `cicd/scripts/run-containers.sh`
10. `cicd/docker/compose.dev.yml`
11. `cicd/docs/cicd.md`
12. `README.md`

## Subtasks And Acceptance Criteria
1. Define shared CI/CD contracts.
   - Acceptance criteria: Validation checks and image targets are declared under `cicd/config`; empty image list is explicitly supported.

2. Create shared local validation runner.
   - Acceptance criteria: Linux-local `bash cicd/scripts/run-validations.sh` executes all configured checks from `cicd/config`; unimplemented checks emit warnings; warning-only runs exit successfully.

3. Create shared local image build runner.
   - Acceptance criteria: Local command builds images from `cicd/config/image-matrix.yml`; empty matrix emits warning and exits successfully.

4. Add local container run workflow scaffold.
   - Acceptance criteria: Devs can run/start containers locally via `cicd/scripts` + `cicd/docker/compose.dev.yml`; behavior is documented when no services are defined yet.

5. Implement GitHub Actions CI entrypoint as a thin shim.
   - Acceptance criteria: `.github/workflows/ci.yml` triggers on push/PR to `main` and manual dispatch; it calls only `cicd/scripts` and `cicd/config` assets; warning semantics are preserved in CI logs.

6. Implement GitHub Actions CD entrypoint as a thin shim.
   - Acceptance criteria: `.github/workflows/cd.yml` is manually triggerable for any branch/ref, calls only `cicd/scripts` and `cicd/config` assets, and keeps publish/deploy gated off by default.

7. Prepare future Docker Hub publish path without enabling it.
   - Acceptance criteria: Docker Hub inputs/secrets and publish steps are documented in `cicd/docs/cicd.md` and/or commented workflow sections, but image publishing remains disabled.

8. Document developer usage.
   - Acceptance criteria: Docs include exact local commands for validate/build/run, warning behavior, and how to add new checks/services/images under `cicd/`.

9. Document repository structure constraints.
   - Acceptance criteria: Docs explicitly state that CI/CD logic lives in `cicd/` while `.github/workflows/` contains mandatory GitHub entrypoint shims only.

## Dependency Ordering
1. Subtask 1 first.
2. Subtasks 2, 3, and 4 in parallel after Subtask 1.
3. Subtasks 5 and 6 depend on Subtasks 2 and 3.
4. Subtask 7 depends on Subtasks 5 and 6.
5. Subtasks 8 and 9 depend on Subtasks 1-7.

## Implementer Agent Prompts
1. Subtask 1 Prompt
   - Allowed files to change:
     - `cicd/config/validation-config.yml`
     - `cicd/config/image-matrix.yml`
   - Task to implement: Define shared CI/CD contracts by declaring validation checks and image targets under `cicd/config`.
   - Acceptance criteria: Validation checks and image targets are declared under `cicd/config`; empty image list is explicitly supported.

2. Subtask 2 Prompt
   - Allowed files to change:
      - `cicd/scripts/run-validations.sh`
      - `cicd/config/validation-config.yml`
    - Task to implement: Create a shared Linux validation runner that loads configured checks from `cicd/config` and executes a single bash-oriented command contract from the repo root.
    - Acceptance criteria: `bash cicd/scripts/run-validations.sh` executes all configured checks from `cicd/config`; unimplemented checks emit warnings; warning-only runs exit successfully.

3. Subtask 3 Prompt
   - Allowed files to change:
     - `cicd/scripts/build-images.ps1`
     - `cicd/scripts/build-images.sh`
     - `cicd/config/image-matrix.yml`
   - Task to implement: Create a shared local image build runner that reads `cicd/config/image-matrix.yml` and builds configured images.
   - Acceptance criteria: Local command builds images from `cicd/config/image-matrix.yml`; empty matrix emits warning and exits successfully.

4. Subtask 4 Prompt
   - Allowed files to change:
     - `cicd/scripts/run-containers.ps1`
     - `cicd/scripts/run-containers.sh`
     - `cicd/docker/compose.dev.yml`
     - `cicd/docs/cicd.md`
   - Task to implement: Add a local container run workflow scaffold using `cicd/scripts` and `cicd/docker/compose.dev.yml`, including documented no-service behavior.
   - Acceptance criteria: Devs can run/start containers locally via `cicd/scripts` + `cicd/docker/compose.dev.yml`; behavior is documented when no services are defined yet.

5. Subtask 5 Prompt
   - Allowed files to change:
     - `.github/workflows/ci.yml`
      - `cicd/scripts/run-validations.sh`
      - `cicd/config/validation-config.yml`
    - Task to implement: Implement GitHub Actions CI as a thin entrypoint shim that triggers on `main` push/PR and manual dispatch, delegating behavior to `cicd/scripts` and `cicd/config`.
    - Acceptance criteria: `.github/workflows/ci.yml` triggers on push/PR to `main` and manual dispatch; it calls only `cicd/scripts` and `cicd/config` assets; warning semantics are preserved in CI logs.

6. Subtask 6 Prompt
   - Allowed files to change:
     - `.github/workflows/cd.yml`
     - `cicd/scripts/build-images.ps1`
     - `cicd/scripts/build-images.sh`
     - `cicd/config/image-matrix.yml`
   - Task to implement: Implement GitHub Actions CD as a thin entrypoint shim that can be manually triggered for any branch/ref and delegates behavior to `cicd/scripts` and `cicd/config`.
   - Acceptance criteria: `.github/workflows/cd.yml` is manually triggerable for any branch/ref, calls only `cicd/scripts` and `cicd/config` assets, and keeps publish/deploy gated off by default.

7. Subtask 7 Prompt
   - Allowed files to change:
     - `.github/workflows/cd.yml`
     - `cicd/docs/cicd.md`
   - Task to implement: Prepare the future Docker Hub publish path by documenting required inputs/secrets and publish steps without enabling publish behavior.
   - Acceptance criteria: Docker Hub inputs/secrets and publish steps are documented in `cicd/docs/cicd.md` and/or commented workflow sections, but image publishing remains disabled.

8. Subtask 8 Prompt
   - Allowed files to change:
     - `cicd/docs/cicd.md`
     - `README.md`
   - Task to implement: Document developer usage for validate/build/run flows and explain how to extend checks/services/images under `cicd/`.
   - Acceptance criteria: Docs include exact local commands for validate/build/run, warning behavior, and how to add new checks/services/images under `cicd/`.

9. Subtask 9 Prompt
   - Allowed files to change:
     - `cicd/docs/cicd.md`
     - `README.md`
     - `.github/workflows/ci.yml`
     - `.github/workflows/cd.yml`
   - Task to implement: Document repository structure constraints that keep CI/CD logic in `cicd/` with GitHub workflow files as thin mandatory entrypoint shims.
   - Acceptance criteria: Docs explicitly state that CI/CD logic lives in `cicd/` while `.github/workflows/` contains mandatory GitHub entrypoint shims only.
