# Local pipeline usage

This document is the practical local runbook for the current Milestone 1 runtime contract.

## Working directory

Run all commands from the repository root:

```bash
cd /home/tstephen/repos/sfus
```

The shared scripts assume repository-root execution even when they resolve their own default config paths.

## Required env contracts

Before running Compose commands, create local env files from examples:

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
```

Ownership of variables:

- `.env.example`: platform/deployment-owned variables used by Compose topology, reverse-proxy metadata, and local MySQL scaffolding.
- `apps/web/.env.example`: web-owned variables for `/api` path targeting, host-run rewrites, and the internal `api` service URL used by the containerized web app.
- `apps/api/.env.example`: API-owned variables for the API port and database contract used by both the long-lived API service and the explicit migration service.

These files are local templates. Production env files and secrets stay on the deployment host outside the repository checkout, including the external MySQL connection values used in production.

## Hybrid local development (default)

Hybrid mode keeps apps on host and MySQL in Compose:

```bash
bash cicd/scripts/run-containers.sh start
```

This starts `mysql` from `cicd/docker/compose.dev.yml`, matching Milestone 1 hybrid expectations.

Host-run defaults:

- web on `localhost:3000`
- api on `localhost:3001`
- MySQL in Compose on `localhost:3306`

In this mode the frontend still targets `/api`; local rewrites forward those requests to the host-run API on port `3001`.

Frontend runtime surfaces available in hybrid mode:

- homepage: `http://localhost:3000/`
- web liveness: `http://localhost:3000/health/live`
- web readiness: `http://localhost:3000/health/ready`
- branded missing-route handling through the Next.js `404` page

## Full-stack container validation path

Use the same local Compose file with the `fullstack` profile to run `web`, `api`, and `mysql` together:

```bash
docker compose --env-file .env -f cicd/docker/compose.dev.yml --profile fullstack up -d --build
```

The containerized web service reaches the containerized API through `WEB_API_INTERNAL_URL=http://api:3001`, while the API service reaches MySQL through `DB_HOST=mysql`.
For repeatable parallel runs, the local Compose file leaves container names project-scoped and accepts optional host-port overrides via `WEB_HOST_PORT`, `API_HOST_PORT`, and `MYSQL_HOST_PORT`.

Stop the stack:

```bash
docker compose --env-file .env -f cicd/docker/compose.dev.yml --profile fullstack down
```

## Production topology contract

Production uses one Compose file:

- `cicd/docker/compose.prod.yml`

It defines long-lived `web` and `api` services, includes reverse-proxy metadata (`VIRTUAL_HOST`, `VIRTUAL_PATH`, `VIRTUAL_PORT`, LetsEncrypt fields), and does **not** bind host ports.

The migration path is explicit and one-off via service `migrate`:

```bash
docker compose --env-file /path/to/host/runtime.env -f cicd/docker/compose.prod.yml --profile migration run --rm --no-deps migrate
```

The migration service is decoupled from app startup so it can run before `web`/`api` rollout without starting any long-lived app services as dependencies.

The API runtime contract after migration is:

- `GET /api/health/live` for process liveness JSON with no dependency checks
- `GET /api/health/ready` for DB plus reviewed-migration readiness JSON, returning HTTP `503` when either dependency is not ready
- `GET /api/docs` for local Swagger when `API_SWAGGER_ENABLED=true`

Normal API startup never runs migrations automatically; the one-off migration command remains the only supported schema application path for Milestone 1.

Use a host-managed env file path for production operations rather than creating `.env` inside the repository checkout. The production API env file values point at the external MySQL 5.7.44 instance documented for Milestone 1.

## Existing CI/CD command surfaces

- `bash cicd/scripts/run-validations.sh cicd/config/validation-config.yml`
- `bash cicd/scripts/smoke-validate.sh`
- `bash cicd/scripts/build-images.sh cicd/config/image-matrix.yml build`
- `bash cicd/scripts/run-containers.sh start`
- `bash cicd/tests/run-validations.sh`

## Production deployment runbook

Milestone 1 production deploys are host-driven from a checked-out Git worktree on the target machine. Keep canonical runtime env files outside the repository checkout, for example:

- `/srv/sfus/shared/runtime.env` for root Compose substitutions such as `SFUS_PUBLIC_HOST` and `LETSENCRYPT_EMAIL`
- `/srv/sfus/shared/web.env` for the web app contract
- `/srv/sfus/shared/api.env` for the API app contract, including the external MySQL 5.7.44 connection

The production Compose file expects `apps/web/.env` and `apps/api/.env` paths within the checkout, so point those paths at the host-managed files with symlinks before deploying:

```bash
ln -sfn /srv/sfus/shared/web.env apps/web/.env
ln -sfn /srv/sfus/shared/api.env apps/api/.env
```

Deploy from the target ref on the host:

```bash
git fetch --tags origin
git checkout <deploy-ref>
docker compose --env-file /srv/sfus/shared/runtime.env -f cicd/docker/compose.prod.yml build web api
docker compose --env-file /srv/sfus/shared/runtime.env -f cicd/docker/compose.prod.yml --profile migration run --rm --no-deps migrate
docker compose --env-file /srv/sfus/shared/runtime.env -f cicd/docker/compose.prod.yml up -d web api
```

This keeps builds on-host, runs the one-off migration before app rollout, and only then updates the long-lived `web` and `api` services.

## Post-deploy validation

After the rollout completes, validate the public surfaces from the host or another trusted operator shell:

```bash
curl -fsS https://starfrontiers.us/ >/dev/null
curl -fsS https://starfrontiers.us/api/health/live
curl -fsS https://starfrontiers.us/api/health/ready
docker compose --env-file /srv/sfus/shared/runtime.env -f cicd/docker/compose.prod.yml ps
docker compose --env-file /srv/sfus/shared/runtime.env -f cicd/docker/compose.prod.yml --profile migration run --rm --no-deps migrate node dist/index.js migration:show
```

The deployment is only considered complete when the homepage responds successfully, API liveness succeeds, API readiness succeeds, and the migration status check reports no missing reviewed migrations.

## Rollback and schema policy

Application rollback is Git-based on the target host:

```bash
git checkout <last-known-good-ref>
docker compose --env-file /srv/sfus/shared/runtime.env -f cicd/docker/compose.prod.yml build web api
docker compose --env-file /srv/sfus/shared/runtime.env -f cicd/docker/compose.prod.yml up -d web api
```

Repeat the post-deploy validation checks after the rollback target is live.

Schema handling remains forward-fix only in Milestone 1. Do not rely on down-migrations during rollback. If a deployment introduced a bad schema change, the recovery path is to ship a new reviewed migration that restores compatibility with the last good application revision or with the forward-fixed replacement.
