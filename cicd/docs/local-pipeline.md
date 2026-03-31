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

## Full-stack container validation path

Use the same local Compose file with the `fullstack` profile to run `web`, `api`, and `mysql` together:

```bash
docker compose --env-file .env -f cicd/docker/compose.dev.yml --profile fullstack up -d --build
```

The containerized web service reaches the containerized API through `WEB_API_INTERNAL_URL=http://api:3001`, while the API service reaches MySQL through `DB_HOST=mysql`.

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
- `bash cicd/scripts/build-images.sh cicd/config/image-matrix.yml build`
- `bash cicd/scripts/run-containers.sh start`
- `bash cicd/tests/run-validations.sh`
