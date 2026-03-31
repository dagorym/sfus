# Revised CI/CD Plan

## Problem And Proposed Approach
Refresh the remaining CI/CD plan work so Subtasks 7-9 match the current shared Planner, Implementer, Tester, Documenter, and Verifier workflows. Preserve Subtasks 1-6 exactly as originally planned, then restate the remaining work in a format that gives downstream agents the inputs they now require, while also adding a remediation subtask for the still-open GitHub Actions warning-annotation issue identified in the completed Subtask 5 verifier report.

## Confirmed Repository Facts
1. The original plan is `plans/cicd-plan.md`.
2. Completed work artifacts for Subtasks 3-6 live under `artifacts/cicd-plan/subtask-3/` through `artifacts/cicd-plan/subtask-6/`.
3. Current shared agent definitions in `~/repos/agents/agents/` require a tighter handoff chain than the original plan assumed:
   - `implementer.yaml` now requires allowed files, acceptance criteria, relevant existing validation commands, test file locations, and a repository-root-relative shared artifact directory.
   - `tester.yaml` now requires explicit test file locations, reuses the same shared artifact directory, writes `tester_report.md` and `tester_result.json`, and writes `documenter_prompt.txt` on success.
   - `documenter.yaml` now owns documentation-only edits, writes `documenter_report.md` and `documenter_result.json`, and writes `verifier_prompt.txt` on success.
   - `verifier.yaml` now reviews the combined implementation, test, and documentation diffs and writes `verifier_report.md` and `verifier_result.json` in the same shared artifact directory.
4. `cicd/docs/cicd.md` and `cicd/tests/README.md` already document the implemented CI/CD behavior; there is no repository-root `README.md` at `/home/tstephen/repos/sfus/README.md`.
5. The current `.github/workflows/ci.yml` is a thin shim that runs `bash cicd/scripts/run-validations.sh cicd/config/validation-config.yml`.
6. The current `.github/workflows/cd.yml` is a manual-dispatch shim that runs `bash cicd/scripts/build-images.sh cicd/config/image-matrix.yml` for `build`, `publish`, and `deploy`, with `run_publish` and `run_deploy` defaulting to `false`.
7. Subtask 4's previously blocking verifier finding was already addressed in the extra remediation cycle 2 artifacts, so no new follow-up subtask is needed for that issue.
8. The only still-open follow-up from the completed Subtasks 3-6 artifacts is in `artifacts/cicd-plan/subtask-5/verifier_report.md`: `cicd/scripts/run-validations.sh` emits GitHub Actions `::warning::...` tokens on stderr instead of the workflow-command channel GitHub Actions parses, and the corresponding test/docs currently validate the wrong channel.

## Assumptions
1. Remaining subtasks should continue using repository-root-relative artifact directories under `artifacts/cicd-plan/` to match the completed Subtasks 3-6 workflow.
2. Remaining work will continue to use `cicd` as the comparison base branch for isolated worktree review unless the operator explicitly changes that orchestration detail.
3. `cicd/docs/cicd.md` should remain the primary human-facing CI/CD documentation source; `cicd/tests/README.md` should only describe test coverage, and `AGENTS.md` should only be updated if the implemented change truly affects repository-wide contributor or agent guidance.
4. A new root `README.md` should not be introduced just to satisfy the original plan wording unless the user explicitly requests that repository-level doc addition.

## Remaining Surface Area
### Likely implementation files
- `.github/workflows/cd.yml`
- `cicd/config/image-matrix.yml`
- `cicd/scripts/run-validations.sh`

### Likely test files
- `cicd/tests/run-validations.sh`
- `cicd/tests/build-images.sh`

### Likely documentation files
- `cicd/docs/cicd.md`
- `cicd/tests/README.md`
- `AGENTS.md` (only if repository-wide CI/CD structure guidance needs to become contributor-facing)

## Overall Documentation Impact
1. Document the future Docker Hub publish path as an explicit but disabled follow-up to the current CD shim.
2. Document exact developer commands for validate/build/run flows, including current warning-only and no-op semantics.
3. Document the repository structure rule that CI/CD logic belongs under `cicd/` while `.github/workflows/` stays limited to platform-required thin shims.
4. Correct the GitHub Actions warning-annotation documentation so it matches the actual output channels once the Subtask 10 remediation lands.

## Subtasks 1-6 (Present And Unchanged)
1. Define shared CI/CD contracts.
   - Acceptance criteria: Validation checks and image targets are declared under `cicd/config`; empty image list is explicitly supported.

2. Create shared local validation runner.
   - Acceptance criteria: Linux-local `bash cicd/scripts/run-validations.sh` executes all configured checks from `cicd/config`; unimplemented checks emit warnings; warning-only runs exit successfully.

3. Create shared local image build runner.
   - Acceptance criteria: Linux-local `bash cicd/scripts/build-images.sh` builds images from `cicd/config/image-matrix.yml`; empty matrix emits warning and exits successfully.

4. Add local container run workflow scaffold.
   - Acceptance criteria: Devs can run/start containers locally via `bash` scripts under `cicd/scripts` plus `cicd/docker/compose.dev.yml`; behavior is documented when no services are defined yet.

5. Implement GitHub Actions CI entrypoint as a thin shim.
   - Acceptance criteria: `.github/workflows/ci.yml` triggers on push/PR to `main` and manual dispatch; it calls only `cicd/scripts` and `cicd/config` assets; warning semantics are preserved in CI logs.

6. Implement GitHub Actions CD entrypoint as a thin shim.
   - Acceptance criteria: `.github/workflows/cd.yml` is manually triggerable for any branch/ref, calls only `cicd/scripts` and `cicd/config` assets, and keeps publish/deploy gated off by default.

## Revised Remaining Subtasks
### 7. Prepare future Docker Hub publish path without enabling it
- Recommended agent path: Implementer -> Tester -> Documenter -> Verifier
- Goal: keep the future Docker Hub publish path explicit in the shared CD contract while preserving the current disabled-by-default behavior.
- Allowed implementation files:
  - `.github/workflows/cd.yml`
  - `cicd/config/image-matrix.yml`
- Tester file locations:
  - `cicd/tests/run-validations.sh`
  - `cicd/tests/build-images.sh`
- Documentation targets:
  - `cicd/docs/cicd.md`
  - `cicd/tests/README.md` (only if coverage or workflow expectations change)
- Repository-root-relative shared artifact directory:
  - `artifacts/cicd-plan/subtask-7`
- Relevant existing validation commands:
  - `bash cicd/tests/run-validations.sh`
  - `bash cicd/tests/build-images.sh`
  - `bash cicd/scripts/build-images.sh cicd/config/image-matrix.yml build`
- Acceptance criteria:
  1. The CD workflow keeps publish disabled by default and still requires explicit manual enablement.
  2. The future Docker Hub publish contract is explicit enough for a later enablement pass, including the intended secret/input names, login location, and image naming source of truth.
  3. `cicd/config/image-matrix.yml` remains the single source of truth for image identifiers/tags that a future publish step would use.
  4. Current `publish` behavior remains a gated placeholder and does not push images.
- Documentation Impact:
  - Update `cicd/docs/cicd.md` with the future Docker Hub publish checklist, expected secrets/inputs, and the fact that publish remains disabled.
  - Update `cicd/tests/README.md` only if new assertions are added for publish-path contract coverage.
- Dependencies:
  - Depends on Subtask 6.
  - Can run in parallel with Subtask 10.
- Implementer Agent Prompt:
  ```text
  You are the implementer agent.

  Allowed files to change:
  - .github/workflows/cd.yml
  - cicd/config/image-matrix.yml

  Task:
  Prepare the future Docker Hub publish path without enabling it. Keep the current manual CD workflow disabled by default for publish/deploy, but make the future Docker Hub contract explicit in the shared CD entrypoint/config so a later enablement pass has a clear starting point.

  Acceptance criteria:
  1. The CD workflow keeps publish disabled by default and still requires explicit manual enablement.
  2. The future Docker Hub publish contract is explicit enough for a later enablement pass, including the intended secret/input names, login location, and image naming source of truth.
  3. `cicd/config/image-matrix.yml` remains the single source of truth for image identifiers/tags that a future publish step would use.
  4. Current `publish` behavior remains a gated placeholder and does not push images.

  Relevant existing validation commands:
  - bash cicd/tests/run-validations.sh
  - bash cicd/tests/build-images.sh
  - bash cicd/scripts/build-images.sh cicd/config/image-matrix.yml build

  Test file locations for the Tester agent:
  - cicd/tests/run-validations.sh
  - cicd/tests/build-images.sh

  Repository-root-relative shared artifact directory:
  - artifacts/cicd-plan/subtask-7
  ```

### 8. Document developer usage
- Recommended agent path: Documenter-led after the implementation-oriented subtasks are stable. If the orchestration cannot start at Documenter, restrict any Implementer stage to documentation files only.
- Goal: document exact developer commands and extension points for validation, image builds, and local container runs based on the behavior that is actually implemented and tested.
- Primary documentation targets:
  - `cicd/docs/cicd.md`
- Secondary documentation/test context:
  - `cicd/tests/README.md`
- Repository-root-relative shared artifact directory:
  - `artifacts/cicd-plan/subtask-8`
- Relevant existing validation commands:
  - `bash cicd/tests/run-validations.sh`
  - `bash cicd/tests/build-images.sh`
  - `bash cicd/tests/run-containers.sh`
- Acceptance criteria:
  1. Documentation includes exact repository-root `bash` commands for validate/build/run flows.
  2. Documentation explains current warning-only success behavior for missing validation commands, empty image matrices, and no-service container scaffolds.
  3. Documentation explains how to extend `cicd/config/validation-config.yml`, `cicd/config/image-matrix.yml`, and `cicd/docker/compose.dev.yml` without implying behavior that is not yet implemented.
  4. Documentation does not refer readers to a root `README.md` that does not currently exist.
- Documentation Impact:
  - This subtask is itself documentation-focused and should update existing docs rather than introducing new top-level docs.
  - Refresh `cicd/tests/README.md` only when the coverage summary changes materially.
- Dependencies:
  - Depends on Subtasks 7 and 10 so the docs capture the final future-publish contract and final GitHub Actions warning semantics.
  - Can run in parallel with Subtask 9 if the fact ownership between files is kept non-overlapping.
- Fallback Implementer Agent Prompt (use only if your orchestration requires an Implementer stage before Documenter):
  ```text
  You are the implementer agent.

  Allowed files to change:
  - cicd/docs/cicd.md
  - cicd/tests/README.md

  Task:
  Update the existing CI/CD documentation so developers can run and extend the validate/build/run workflows from the repository root using the behavior that is already implemented and tested. Do not change scripts, workflows, config, or tests in this subtask.

  Acceptance criteria:
  1. Documentation includes exact repository-root `bash` commands for validate/build/run flows.
  2. Documentation explains current warning-only success behavior for missing validation commands, empty image matrices, and no-service container scaffolds.
  3. Documentation explains how to extend `cicd/config/validation-config.yml`, `cicd/config/image-matrix.yml`, and `cicd/docker/compose.dev.yml` without implying behavior that is not yet implemented.
  4. Documentation does not refer readers to a root `README.md` that does not currently exist.

  Relevant existing validation commands:
  - bash cicd/tests/run-validations.sh
  - bash cicd/tests/build-images.sh
  - bash cicd/tests/run-containers.sh

  Test file locations for the Tester agent:
  - No new tests expected; reuse existing CI/CD tests as regression evidence only.

  Repository-root-relative shared artifact directory:
  - artifacts/cicd-plan/subtask-8
  ```

### 9. Document repository structure constraints
- Recommended agent path: Documenter-led, with `AGENTS.md` reviewed only if the final wording should become repository-wide contributor guidance.
- Goal: make the CI/CD layout rule explicit so future work keeps operational logic in `cicd/` and preserves `.github/workflows/` as thin platform shims only.
- Primary documentation targets:
  - `cicd/docs/cicd.md`
- Conditional documentation target:
  - `AGENTS.md` (only if the resulting guidance should apply repository-wide to future contributors/agents)
- Repository-root-relative shared artifact directory:
  - `artifacts/cicd-plan/subtask-9`
- Relevant existing validation commands:
  - `bash cicd/tests/run-validations.sh`
- Acceptance criteria:
  1. Documentation explicitly states that CI/CD operational logic belongs under `cicd/`.
  2. Documentation explicitly states that `.github/workflows/*.yml` files are platform-required entrypoints and should stay thin.
  3. The structure guidance points future maintainers to shared scripts/config instead of encouraging duplicated workflow logic.
  4. Repository-wide guidance is updated only if needed and without duplicating detailed behavior already documented elsewhere.
- Documentation Impact:
  - Update `cicd/docs/cicd.md` with the architecture rule.
  - Update `AGENTS.md` only if the team wants the same rule enforced as repository-wide contributor guidance.
- Dependencies:
  - Depends on Subtasks 7 and 10 so the structure guidance reflects the final remaining CI/CD contract.
  - Can run in parallel with Subtask 8 if the documentation ownership split is clear.
- Fallback Implementer Agent Prompt (use only if your orchestration requires an Implementer stage before Documenter):
  ```text
  You are the implementer agent.

  Allowed files to change:
  - cicd/docs/cicd.md
  - AGENTS.md

  Task:
  Update documentation to make the repository structure constraints explicit: CI/CD logic should live in `cicd/`, while `.github/workflows/*.yml` should remain thin platform entrypoints that delegate to shared scripts/config. Only touch `AGENTS.md` if the final wording needs to become repository-wide contributor guidance.

  Acceptance criteria:
  1. Documentation explicitly states that CI/CD operational logic belongs under `cicd/`.
  2. Documentation explicitly states that `.github/workflows/*.yml` files are platform-required entrypoints and should stay thin.
  3. The structure guidance points future maintainers to shared scripts/config instead of encouraging duplicated workflow logic.
  4. Repository-wide guidance is updated only if needed and without duplicating detailed behavior already documented elsewhere.

  Relevant existing validation commands:
  - bash cicd/tests/run-validations.sh

  Test file locations for the Tester agent:
  - No new tests expected; reuse existing CI/CD tests as regression evidence only.

  Repository-root-relative shared artifact directory:
  - artifacts/cicd-plan/subtask-9
  ```

### 10. Remediate GitHub Actions warning annotation channel for the CI validation runner
- Recommended agent path: Implementer -> Tester -> Documenter -> Verifier
- Goal: close the still-open Subtask 5 verifier finding by emitting GitHub Actions annotations on the correct parsed channel while preserving the existing warning-only runner semantics.
- Allowed implementation files:
  - `cicd/scripts/run-validations.sh`
- Tester file locations:
  - `cicd/tests/run-validations.sh`
- Documentation targets:
  - `cicd/docs/cicd.md`
  - `cicd/tests/README.md`
- Repository-root-relative shared artifact directory:
  - `artifacts/cicd-plan/subtask-10`
- Relevant existing validation commands:
  - `bash cicd/tests/run-validations.sh`
  - `GITHUB_ACTIONS=true bash cicd/scripts/run-validations.sh cicd/config/validation-config.yml`
- Acceptance criteria:
  1. When `GITHUB_ACTIONS=true`, warning messages remain visible to humans and `::warning::...` is emitted on the workflow-command channel GitHub Actions parses.
  2. When `GITHUB_ACTIONS` is unset, no GitHub Actions annotation token is emitted.
  3. Warning-only runs still exit successfully.
  4. `cicd/tests/run-validations.sh` verifies the correct output channel behavior instead of only checking token presence on stderr.
  5. `cicd/docs/cicd.md` and `cicd/tests/README.md` describe the corrected behavior accurately.
- Documentation Impact:
  - Correct the Actions warning-annotation explanation in `cicd/docs/cicd.md`.
  - Correct the test-coverage description in `cicd/tests/README.md` so it matches the fixed channel semantics.
- Dependencies:
  - Depends on Subtask 5.
  - Should finish before Subtasks 8 and 9 so later docs do not preserve the current inaccurate description.
- Implementer Agent Prompt:
  ```text
  You are the implementer agent.

  Allowed files to change:
  - cicd/scripts/run-validations.sh

  Task:
  Remediate the still-open GitHub Actions warning-annotation defect from the Subtask 5 verifier report. Preserve the existing warning text and warning-only success semantics, but when `GITHUB_ACTIONS=true`, emit the `::warning::...` token on the channel GitHub Actions actually parses for workflow commands.

  Acceptance criteria:
  1. When `GITHUB_ACTIONS=true`, warning messages remain visible to humans and `::warning::...` is emitted on the workflow-command channel GitHub Actions parses.
  2. When `GITHUB_ACTIONS` is unset, no GitHub Actions annotation token is emitted.
  3. Warning-only runs still exit successfully.
  4. `cicd/tests/run-validations.sh` verifies the correct output channel behavior instead of only checking token presence on stderr.
  5. `cicd/docs/cicd.md` and `cicd/tests/README.md` describe the corrected behavior accurately.

  Relevant existing validation commands:
  - bash cicd/tests/run-validations.sh
  - GITHUB_ACTIONS=true bash cicd/scripts/run-validations.sh cicd/config/validation-config.yml

  Test file locations for the Tester agent:
  - cicd/tests/run-validations.sh

  Repository-root-relative shared artifact directory:
  - artifacts/cicd-plan/subtask-10
  ```

## Revised Dependency Ordering
1. Subtasks 1-6 remain unchanged from the original plan and preserve their original ordering.
2. Subtask 10 depends on Subtask 5 and should complete before the final documentation-focused remaining work.
3. Subtask 7 depends on Subtask 6 and can run in parallel with Subtask 10.
4. Subtasks 8 and 9 depend on Subtasks 7 and 10 so they document the final remaining CI/CD contract rather than the current partially outdated behavior.
5. Subtasks 8 and 9 may run in parallel, or be delivered in one coordinated documentation pass, as long as fact ownership between `cicd/docs/cicd.md`, `cicd/tests/README.md`, and `AGENTS.md` stays clear and non-duplicative.

## Output Artifact
- Revised plan path: `plans/cicd-plan-revised.md`
