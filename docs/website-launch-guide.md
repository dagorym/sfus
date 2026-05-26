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
  - `AUTH_SESSION_TOKEN_PEPPER=changeme-session-token-pepper` (required, minimum 16 characters, used to hash stored session and verification tokens)
  - `AUTH_SESSION_TTL_MINUTES=1440` (integer 5-43200)
  - `AUTH_SESSION_IDLE_TIMEOUT_MINUTES=120` (integer 5-10080 and must be less than or equal to the session TTL)
  - `AUTH_EMAIL_VERIFICATION_TTL_MINUTES=60` (integer 5-10080, controls verification-token expiry)
  - `AUTH_EXTERNAL_STATE_TTL_MINUTES=10` (integer 5-60, controls external callback-state expiry)
  - `AUTH_TOTP_ISSUER=SFUS Development` (required issuer label presented to authenticator apps)
  - `AUTH_RECOVERY_CODE_COUNT=10` (integer 6-20)
  - `AUTH_RECOVERY_CODE_LENGTH=12` (integer 8-16)
  - `AUTH_GOOGLE_CLIENT_ID` / `AUTH_GOOGLE_CLIENT_SECRET` / `AUTH_GOOGLE_CALLBACK_URL` (required for Google sign-in)
  - `AUTH_GITHUB_CLIENT_ID` / `AUTH_GITHUB_CLIENT_SECRET` / `AUTH_GITHUB_CALLBACK_URL` (required for GitHub sign-in)
  - `DB_HOST=mysql`
  - `DB_PORT=3306`
  - `DB_NAME=sfus`
  - `DB_USER=sfus`
  - `DB_PASSWORD=changeme-app`

Set the external callback URLs to the public API routes that providers can reach, typically `https://<public-host>/api/auth/external/google/callback` and `https://<public-host>/api/auth/external/github/callback` in deployed environments.

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

The current local auth API surface is available under `/api/auth`:

- `POST /api/auth/register` creates a local account, stores the password with Argon2id plus the configured password pepper, and returns an email-verification requirement.
- `POST /api/auth/verify-email` consumes a single-use verification token before the user can log in successfully.
- `POST /api/auth/login` either issues the `sfus_session` HTTP-only cookie with `{ user, session }` or returns `{ mfa }` when a verified MFA factor must complete before session issuance.
- `POST /api/auth/mfa/challenge` verifies a challenge with either an authenticator code or a single-use recovery code, then issues the session cookie.
- `POST /api/auth/mfa/enroll` starts authenticated TOTP enrollment and returns the secret plus `otpauth://` URI.
- `POST /api/auth/mfa/enroll/verify` verifies the enrollment code and returns recovery codes once.
- `POST /api/auth/mfa/recovery/regenerate` rotates recovery codes after authenticated MFA proof and invalidates the previous set.
- `POST /api/auth/mfa/disable` removes MFA after authenticated MFA proof.
- `POST /api/auth/logout` revokes the current session and clears the cookie.
- `GET /api/auth/session` returns the same stable `{ user, session }` contract while the session remains active, including `user.onboardingRequired`.
- `GET /api/auth/external/google/start` and `GET /api/auth/external/github/start` initiate provider redirects.
- `GET /api/auth/external/:provider/callback` handles callback code/state exchange, deterministic account linking, and either session issuance or redirect into the MFA challenge flow when required.
- `POST /api/auth/onboarding/username` completes first-login external onboarding by setting the final username.
- `GET /api/auth/profile` returns profile basics (`username`, `email`, `displayName`) for authenticated users; `PATCH /api/auth/profile` updates `displayName` and returns the same profile payload.
- `GET /api/auth/settings` returns account settings basics (`username`, `email`, `emailVerified`, `mfaEnabled`) for authenticated users; `PATCH /api/auth/settings` updates `username` only (with uniqueness enforcement) and returns the same settings payload.
- The account profile/settings routes now evaluate the shared authorization contract (global roles + ACL grants) and support representative cross-account checks through `?userId=<targetUserId>` when the caller is authorized.

Session-cookie behavior is intentionally deployment-aware:

- the cookie is always `HttpOnly`, `SameSite=Lax`, and scoped to `/`
- the cookie becomes `Secure` in production deployments
- session resolution revokes records that hit either the absolute TTL or idle-timeout boundary

For local development and tests, registration responses may include the raw verification token so the flow can be exercised without a real mail provider. Production behavior still stores only the hashed token and requires verification before login succeeds.

The `/register` page enforces and documents the same backend constraints:

- username: 3-32 characters, using only letters, numbers, periods (`.`), dashes (`-`), and underscores (`_`)
- password: at least 12 characters

Registration failure feedback in the UI is now intentionally actionable:

- invalid input returns the API validation message
- duplicate email or username maps to a duplicate-account message
- server/setup failures prompt checking API readiness, database connectivity, and the explicit migration step

Current user-facing website behavior is intentionally narrow:

- branded homepage at `/`
- branded `404` handling for unknown routes
- branded runtime error surface
- sign-in entry page at `/login` (local password or external provider)
- local registration page at `/register`
- MFA challenge handling in `/login` for both password and external flows, including authenticator-code or recovery-code completion before session issuance
- local registration flow at `/register` that can auto-verify the development token and attempt immediate sign-in
- authenticated shell/profile/settings routes now use one shared client authorization-state resolver (`resolveProtectedSession`) for unauthenticated and onboarding-required handling
- authenticated shell route at `/app` that redirects unauthenticated users to `/login?next=/app` and first-login users to `/onboarding/username`
- authenticated profile route at `/profile` backed by `/api/auth/profile` and redirected to `/login?next=/profile` when unauthenticated
- authenticated settings route at `/settings` backed by `/api/auth/settings` and redirected to `/login?next=/settings` when unauthenticated
- username onboarding page at `/onboarding/username` that posts the final username and returns the user to `/app`

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
