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

- `.env.example`: platform/deployment-owned variables used by Compose topology (public host and MySQL container settings).
- `apps/web/.env.example`: web-owned variables.
- `apps/api/.env.example`: API-owned variables.

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

## Full-stack container validation path

Use the same local Compose file with the `fullstack` profile to run `web`, `api`, and `mysql` together:

```bash
docker compose --env-file .env -f cicd/docker/compose.dev.yml --profile fullstack up -d --build
```

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
docker compose --env-file .env -f cicd/docker/compose.prod.yml --profile migration run --rm migrate
```

## Existing CI/CD command surfaces

- `bash cicd/scripts/run-validations.sh cicd/config/validation-config.yml`
- `bash cicd/scripts/build-images.sh cicd/config/image-matrix.yml build`
- `bash cicd/scripts/run-containers.sh start`
- `bash cicd/tests/run-validations.sh`
