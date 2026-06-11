# Testing & Validation

The single home for every test and validation command in this repo.

**Code:** `cicd/config/validation-config.yml`, `cicd/scripts/`, `cicd/tests/`, per-app Vitest
specs (`*.test.ts` in `apps/api/src`, `*.spec.ts` in `apps/web`)
**Related:** [workspace](workspace.md) for the command surface ·
[launch](../operations/launch.md) for starting the stack the DB spec needs

## 1. Workspace lint, typecheck, and Vitest suites

```bash
npx --yes pnpm@10.0.0 lint
npx --yes pnpm@10.0.0 typecheck
npx --yes pnpm@10.0.0 test
```

Run a single Vitest file by filtering to the owning workspace:

```bash
# API
npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run src/health/health.controller.test.ts
# Web
npx --yes pnpm@10.0.0 --filter @sfus/web exec vitest run app/public-shell.spec.ts
```

## 2. Shared validation runner (what CI runs)

```bash
bash cicd/scripts/run-validations.sh cicd/config/validation-config.yml
```

Executes every entry in `validation-config.yml`: workspace lint/typecheck/test, the
full-stack smoke flow, repo-structure contract checks, and the (gated) DB integration spec.
GitHub Actions CI is a thin shim over this same command — see `cicd/docs/cicd.md`.

## 3. Full-stack smoke validation

```bash
bash cicd/scripts/smoke-validate.sh
```

Builds the `web`/`api` images, starts the full Compose stack, runs the explicit migration
command, and verifies the homepage plus API liveness/readiness. It stages per-run env copies
and a templated Compose file under the worktree-local runtime area
(`git rev-parse --git-path smoke-validate`) and reserves unique high host ports, so repeated
and parallel runs don't mutate `.env` files or collide on ports. Safe to run with no prior
setup (it copies env templates when local `.env` files are absent).

## 4. CI/CD contract tests (Bash)

```bash
bash cicd/tests/run-validations.sh
```

Covers the shared CI/CD shell scripts and config contracts. Details: `cicd/tests/README.md`.

## 5. PagesService DB integration spec (opt-in)

`apps/api/src/pages/pages.service.integration.test.ts` runs `PagesService.create` against a
real MySQL schema so the `fk_page_revisions_page_id` foreign key is enforced by the engine.
It is gated on `SFUS_DB_INTEGRATION=1` and **skips cleanly when unset**, so the default
`test` pass and `run-validations.sh` require no database.

```bash
# Start dev MySQL (if not already running):
bash cicd/scripts/run-containers.sh start

# Apply migrations via the fullstack Compose path:
docker compose --env-file .env -f cicd/docker/compose.dev.yml --profile fullstack run --rm api node dist/index.js migration:run

# Run the integration spec:
SFUS_DB_INTEGRATION=1 \
DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=sfus \
DB_USER=sfus DB_PASSWORD=changeme-app \
npx --yes pnpm@10.0.0 --filter @sfus/api run test:integration
```

The `DB_*` values match the hybrid-dev defaults in [launch](../operations/launch.md). The
same env vars activate the `pages-service-integration` entry when running the shared
validation runner instead.

Note: migration *inspection* commands (`migration:show`) use the API env contract and need
reachable MySQL; without a running `mysql` service they fail at the connection step, which is
expected.

## 6. DocsService DB integration spec (opt-in, direct vitest)

`apps/api/src/docs/docs.service.integration.test.ts` tests `DocsService.createPage` and
`DocsService.addRevision` against a real MySQL schema — specifically the unique
`(scope_type, scope_id, path_hash)` index collision and transactional atomicity (P10).

Unlike section 5, this file is **not** included in the `test:integration` npm script
(which targets only `pages.service.integration.test.ts`). Run it directly via vitest:

```bash
SFUS_DB_INTEGRATION=1 \
DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=sfus \
DB_USER=sfus DB_PASSWORD=changeme-app \
npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run src/docs/docs.service.integration.test.ts
```

The spec is gated on `SFUS_DB_INTEGRATION=1` and skips cleanly without it.

## Recommended full local verification order

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env

docker compose --env-file .env -f cicd/docker/compose.dev.yml --profile fullstack up -d --build
docker compose --env-file .env -f cicd/docker/compose.dev.yml --profile fullstack run --rm api node dist/index.js migration:run
curl -fsS http://localhost:3000/
curl -fsS http://localhost:3001/api/health/ready

npx --yes pnpm@10.0.0 test
bash cicd/scripts/smoke-validate.sh
bash cicd/tests/run-validations.sh
```
