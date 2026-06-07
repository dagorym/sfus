# CI/CD Contract

The validation runner, shared scripts, config contracts, and the GitHub workflow shims. For
*using* these to run or test the system, see `docs/development/testing.md`; for launch and
deployment runbooks, see `docs/operations/`.

## Shared runners

Run from the repository root:

```bash
bash cicd/scripts/run-validations.sh cicd/config/validation-config.yml
bash cicd/scripts/smoke-validate.sh
bash cicd/scripts/build-images.sh cicd/config/image-matrix.yml build
bash cicd/scripts/run-containers.sh start
```

- `run-validations.sh` executes every entry in `cicd/config/validation-config.yml`
  sequentially (workspace lint/typecheck/test, the smoke flow, repo-structure contract
  checks, and the `SFUS_DB_INTEGRATION`-gated DB integration entry). It warns on missing
  commands by default, emits `::warning::` workflow commands only when `GITHUB_ACTIONS` is
  set, and exits non-zero on any failure.
- `smoke-validate.sh` builds the apps, starts the full local stack, runs the explicit
  migration command, and verifies the homepage plus API liveness/readiness. It stages
  per-run env copies and a templated Compose file under the worktree-local runtime area
  (`git rev-parse --git-path smoke-validate`) and reserves unique high host ports, so
  parallel runs never mutate the shared `.env` files or collide on ports.
- `build-images.sh` reads `cicd/config/image-matrix.yml`. `build` (alias `validation`)
  builds configured images; an empty `images: []` matrix warns and succeeds; `publish` and
  `deploy` are reserved, gated, warning-only no-op stages.
- `run-containers.sh` drives `cicd/docker/compose.dev.yml` (default action `start`; also
  `run`, `stop|down`, `status|ps`, `logs`).

## Config contracts

- `cicd/config/validation-config.yml` — the single source of validation entries; commands
  are Linux-only `command` fields invoked via `npx --yes pnpm@10.0.0 ...` or `bash ...`.
- `cicd/config/image-matrix.yml` — image build targets; currently `images: []` with
  `publish_enabled: false` / `deploy_enabled: false` and a documented (not enabled) future
  Docker Hub publish contract.

## Runtime contract artifacts

- env examples: `.env.example` (platform), `apps/web/.env.example` (web),
  `apps/api/.env.example` (api) — canonical variable tables in `docs/operations/launch.md`
- Docker builds: `apps/web/Dockerfile`, `apps/api/Dockerfile` (multi-stage)
- local Compose (hybrid + `fullstack` profile): `cicd/docker/compose.dev.yml`
- production Compose (single-file topology, `migration` profile): `cicd/docker/compose.prod.yml`
- service naming contract: `web`, `api`, `mysql` (local only)

## GitHub workflow shims

Workflows stay thin and delegate to the scripts above:

- `.github/workflows/ci.yml` — `push`/`pull_request` on `main` + `workflow_dispatch`;
  installs the workspace and runs
  `bash cicd/scripts/run-validations.sh cicd/config/validation-config.yml`.
- `.github/workflows/cd.yml` — `workflow_dispatch` only; always runs the image build step,
  with `publish`/`deploy` jobs gated behind explicit boolean inputs (no-ops while the image
  matrix keeps them disabled). It documents the future Docker Hub namespace/secret inputs
  without enabling login or push.

`cicd/tests/` holds the Bash contract tests that pin all of the above behavior — run
`bash cicd/tests/run-validations.sh`; coverage details in `cicd/tests/README.md`.
