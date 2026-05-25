# Website Launch Guide

This guide covers the parts of the system that are currently built and runnable in this repository, with emphasis on the website container path and the available test commands.

## What Is Built Today

- `apps/web` is a Next.js website with a branded homepage at `/`.
- `apps/web` also exposes `GET /health/live` and `GET /health/ready`.
- `apps/api` is a NestJS API that the website expects behind `/api`.
- The containerized `web` service is not a standalone deployment path in local development. In this repo, it is launched through the full-stack Compose profile alongside `api` and `mysql`.

## Prerequisites

- Docker with `docker compose`
- Node.js and `npm` if you want to run the host-side workspace tests

The current machine check showed:

- `docker` is available
- `docker compose` is available
- `npm` and `npx` are available
- `pnpm` is not installed globally
- `corepack` is not installed globally

That is still sufficient for the documented host-side validation commands because the repo already defines `npx --yes pnpm@10.0.0 ...` entrypoints in `cicd/config/validation-config.yml`.

## Required Local Configuration

Create the local env files from the checked-in examples:

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
```

No additional value changes are required for the default local full-stack launch.

The default local config contracts are:

- `.env`
  - `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`
  - optional host metadata and `LOCAL_API_ORIGIN`
- `apps/web/.env`
  - `NEXT_PUBLIC_API_BASE_PATH=/api`
  - `WEB_API_ORIGIN=http://localhost:3001`
  - `WEB_API_INTERNAL_URL=http://api:3001`
- `apps/api/.env`
  - `API_PORT=3001`
  - `AUTH_PASSWORD_PEPPER=changeme-auth-pepper` (required, minimum 16 characters)
  - `AUTH_PASSWORD_BCRYPT_ROUNDS=12` (integer 8-15)
  - `AUTH_SESSION_TTL_MINUTES=1440` (integer 5-43200)
  - `AUTH_SESSION_IDLE_TIMEOUT_MINUTES=120` (integer 5-10080 and must be less than or equal to the session TTL)
  - `AUTH_TOTP_ISSUER=SFUS Development` (required issuer label presented to authenticator apps)
  - `AUTH_RECOVERY_CODE_COUNT=10` (integer 6-20)
  - `AUTH_RECOVERY_CODE_LENGTH=12` (integer 8-16)
  - `DB_HOST=mysql`
  - `DB_PORT=3306`
  - `DB_NAME=sfus`
  - `DB_USER=sfus`
  - `DB_PASSWORD=changeme-app`

Optional local port overrides are supported through the root `.env` invocation environment:

```bash
WEB_HOST_PORT=3000 API_HOST_PORT=3001 MYSQL_HOST_PORT=3306 \
docker compose --env-file .env -f cicd/docker/compose.dev.yml --profile fullstack up -d --build
```

## Build And Launch The Website Container

Run from the repository root:

```bash
docker compose --env-file .env -f cicd/docker/compose.dev.yml --profile fullstack up -d --build
```

This launches:

- `mysql`
- `api`
- `web`

The service dependency chain is:

- `web` depends on `api`
- `api` depends on `mysql`

The website container binds to `http://localhost:3000` by default.

## Interacting With The Running Website

Useful local URLs after startup:

- homepage: `http://localhost:3000/`
- web liveness: `http://localhost:3000/health/live`
- web readiness: `http://localhost:3000/health/ready`
- API liveness: `http://localhost:3001/api/health/live`
- API readiness: `http://localhost:3001/api/health/ready`

Current user-facing website behavior is intentionally narrow:

- branded homepage at `/`
- branded `404` handling for unknown routes
- branded runtime error surface
- navigation currently limited to `Home`

## Run The Database Migration

The API image does not run migrations automatically on startup. After the stack is up, run the explicit migration step:

```bash
docker compose --env-file .env -f cicd/docker/compose.dev.yml --profile fullstack run --rm api node dist/index.js migration:run
```

Migration inspection commands such as `npx --yes pnpm@10.0.0 --filter @sfus/api run migration:show` use the same API environment contract and also require reachable MySQL connectivity. In a worktree without a running `mysql` service, those inspection commands are expected to fail at the connection step until MySQL is available.

After that, verify readiness:

```bash
curl -fsS http://localhost:3001/api/health/ready
curl -fsS http://localhost:3000/health/ready
```

## Stop The Stack

```bash
docker compose --env-file .env -f cicd/docker/compose.dev.yml --profile fullstack down
```

## Test And Validation Commands

There are three useful test surfaces in this repo.

### 1. Workspace lint, typecheck, and Vitest suites

These are the repo's canonical host-side workspace commands:

```bash
npx --yes pnpm@10.0.0 lint
npx --yes pnpm@10.0.0 typecheck
npx --yes pnpm@10.0.0 test
```

Those commands are the same command family used by `cicd/config/validation-config.yml`.

### 2. Full-stack smoke validation

This is the fastest way to verify that the built website container path works end to end:

```bash
bash cicd/scripts/smoke-validate.sh
```

It performs all of the following:

- builds the `web` and `api` images
- starts the full stack with Compose
- runs the explicit migration command
- checks the homepage
- checks API liveness and readiness

`smoke-validate.sh` copies env templates automatically when local `.env` files are absent, so it is safe to use as a runtime verification entrypoint.

### 3. CI/CD contract tests for the shell scripts

These tests cover the Bash-based CI/CD helpers under `cicd/`:

```bash
bash cicd/tests/run-validations.sh
```

## Recommended Local Verification Order

If you want to confirm both the website container and the repo validation surfaces:

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

## Current Local Setup Notes

On this machine, the only missing host-side tool for the workspace commands is `pnpm`, but the repo's `npx --yes pnpm@10.0.0 ...` pattern should avoid needing a global install.
