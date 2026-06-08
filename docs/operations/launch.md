# Local Launch Guide

Setting up, starting, and stopping the system locally: env files, the two local run modes,
migrations, and runtime URLs. This is also the **canonical environment-variable contract** —
every variable, owner, default, and constraint lives here and nowhere else.

**Code:** `.env.example`, `apps/web/.env.example`, `apps/api/.env.example`,
`cicd/docker/compose.dev.yml`, `cicd/scripts/run-containers.sh`
**Related:** [deployment](deployment.md) for production ·
[testing](../development/testing.md) for validation commands ·
[guides/content-management](../guides/content-management.md) for using the running site

## Prerequisites

- Docker with `docker compose`
- Node.js (with `npx`) for host-side commands; a global `pnpm` is not required — the repo
  standard is `npx --yes pnpm@10.0.0 ...`

## Create the local env files

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
```

No value changes are required to boot the default local stack. Google/GitHub sign-in needs
real provider credentials and reachable callback URLs before those flows work end to end
(placeholders still allow the stack to boot); set callback URLs to the public API routes,
e.g. `https://<public-host>/api/auth/external/google/callback`.

## Environment contract

Ownership is split by runtime boundary. The example files are templates only — production
values are host-managed outside the checkout (see [deployment](deployment.md)).

### Root `.env` — platform/deployment-owned (Compose + MySQL scaffolding)

| Variable | Default | Notes |
|---|---|---|
| `SFUS_PUBLIC_HOST` | `starfrontiers.us` | reverse-proxy metadata (production) |
| `LETSENCRYPT_EMAIL` | `ops@starfrontiers.us` | cert issuance contact (production) |
| `MYSQL_ROOT_PASSWORD` | `changeme-root` | local Compose MySQL |
| `MYSQL_DATABASE` / `MYSQL_USER` / `MYSQL_PASSWORD` | `sfus` / `sfus` / `changeme-app` | local Compose MySQL |
| `WEB_HOST_PORT` / `API_HOST_PORT` / `MYSQL_HOST_PORT` | unset (3000 / 3001 / 3306) | optional host-port overrides |
| `LOCAL_API_ORIGIN` | `http://localhost:3001` | host metadata for local rewrites |

### `apps/web/.env` — web-owned

| Variable | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_PATH` | `/api` | keep `/api` for proxy compatibility |
| `WEB_API_ORIGIN` | `http://localhost:3001` | dev-mode rewrite target (hybrid mode) |
| `WEB_API_INTERNAL_URL` | `http://api:3001` | non-dev rewrite target inside containers |

### `apps/api/.env` — API-owned (validated at startup; invalid values prevent boot)

| Variable | Default | Constraint |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `API_PORT` | `3001` | integer 1–65535 |
| `API_SWAGGER_ENABLED` | `true` | boolean; default on outside production |
| `AUTH_PASSWORD_PEPPER` | `changeme-auth-pepper` | required, ≥ 16 chars; password hashing only |
| `AUTH_SESSION_TOKEN_PEPPER` | `changeme-session-token-pepper` | required, ≥ 16 chars; hashes/signs all stored tokens |
| `AUTH_SESSION_TTL_MINUTES` | `1440` | integer 5–43200 |
| `AUTH_SESSION_IDLE_TIMEOUT_MINUTES` | `120` | integer 5–10080; must be ≤ session TTL |
| `AUTH_EMAIL_VERIFICATION_TTL_MINUTES` | `60` | integer 5–10080 |
| `AUTH_EXTERNAL_STATE_TTL_MINUTES` | `10` | integer 5–60; also the MFA-challenge TTL |
| `AUTH_TOTP_ISSUER` | `SFUS Development` | required; label shown by authenticator apps |
| `AUTH_RECOVERY_CODE_COUNT` | `10` | integer 6–20 |
| `AUTH_RECOVERY_CODE_LENGTH` | `12` | integer 8–16 |
| `AUTH_GOOGLE_CLIENT_ID` / `_SECRET` / `_CALLBACK_URL` | placeholders | required (placeholders boot; real values needed for working sign-in) |
| `AUTH_GITHUB_CLIENT_ID` / `_SECRET` / `_CALLBACK_URL` | placeholders | required (same as Google) |
| `MEDIA_UPLOAD_MAX_SIZE_BYTES` | `5242880` | integer 1024–20971520; applies to all resource types except `avatar` |
| `MEDIA_AVATAR_UPLOAD_MAX_SIZE_BYTES` | `1048576` | integer 1024–2097152; tighter size cap for `avatar` uploads only |
| `MEDIA_ALLOWED_MIME_TYPES` | `image/jpeg,image/png,image/gif,image/webp` | comma-separated `type/subtype`, ≥ 1 entry |
| `MEDIA_STORAGE_PATH` | `./storage/uploads` | required; Compose overrides to the named volume (below) |
| `DB_HOST` | `127.0.0.1` | hybrid-dev value; full-stack Compose overrides to `mysql` |
| `DB_PORT` | `3306` | integer 1–65535; match `MYSQL_HOST_PORT` if overridden |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | `sfus` / `sfus` / `changeme-app` | must match the root `.env` MySQL values |
| `DB_CONNECT_TIMEOUT_MS` | `5000` | integer 1000–60000 |
| `DB_MIGRATIONS_TABLE` | `sfus_migrations` | `[A-Za-z0-9_]+`; readiness checks this table |
| `THROTTLE_WINDOW_MS` | — | **required**; integer 1000–3600000; rate-limit window duration |
| `THROTTLE_MAX_HITS` | — | **required**; integer 1–10000; max hits per window for established accounts |
| `THROTTLE_NEW_ACCOUNT_MAX_HITS` | — | **required**; integer 1–10000; max hits per window for new-account tier; must be ≤ `THROTTLE_MAX_HITS` |
| `THROTTLE_NEW_ACCOUNT_WINDOW_MS` | — | **required**; integer 60000–2592000000; how long (ms) after account creation the new-account tier applies |
| `THROTTLE_MAX_LINKS_PER_POST` | — | **required**; integer 0–100; maximum URLs allowed in a single Markdown post body |

Container-only overrides (`DB_HOST=mysql`, `MEDIA_STORAGE_PATH=/app/storage/uploads`,
`WEB_API_INTERNAL_URL=http://api:3001`) are applied by the Compose files — do not copy them
into a host-run hybrid process.

## Mode 1 — hybrid local development (default)

Apps on the host, MySQL in Compose:

```bash
bash cicd/scripts/run-containers.sh start    # starts mysql from compose.dev.yml
npx --yes pnpm@10.0.0 --filter @sfus/api run build && npx --yes pnpm@10.0.0 --filter @sfus/api run start
npx --yes pnpm@10.0.0 --filter @sfus/web run dev
```

- web on `localhost:3000`, api on `localhost:3001`, MySQL published on `localhost:3306`
- the frontend targets `/api`; dev rewrites forward to the host-run API
  (see [web-shell](../features/web-shell.md))
- `apps/api/.env` must point at `DB_HOST=127.0.0.1` with the published MySQL port

`run-containers.sh` also accepts `stop|down`, `status|ps`, and `logs`.

## Mode 2 — full-stack containers (`fullstack` profile)

```bash
docker compose --env-file .env -f cicd/docker/compose.dev.yml --profile fullstack up -d --build
```

Launches `mysql` ← `api` ← `web` (dependency order). The web container reaches the API via
`http://api:3001`; the API reaches MySQL via `DB_HOST=mysql`. Optional port overrides:

```bash
WEB_HOST_PORT=3000 API_HOST_PORT=3001 MYSQL_HOST_PORT=3306 \
docker compose --env-file .env -f cicd/docker/compose.dev.yml --profile fullstack up -d --build
```

Stop the stack:

```bash
docker compose --env-file .env -f cicd/docker/compose.dev.yml --profile fullstack down
```

## Media uploads volume

Both Compose files declare the `sfus_media_uploads` named volume, mounted into the `api`
container at `/app/storage/uploads` with `MEDIA_STORAGE_PATH` set to match (the production
`migrate` service mounts it too). Uploads survive container restarts and image rebuilds. In
production this volume must be durable storage included in backups.

## Run the database migration

The API never runs migrations on startup. After the stack is up:

```bash
docker compose --env-file .env -f cicd/docker/compose.dev.yml --profile fullstack run --rm api node dist/index.js migration:run
```

Then verify readiness:

```bash
curl -fsS http://localhost:3001/api/health/ready
curl -fsS http://localhost:3000/health/ready
```

(Host-run alternative once MySQL is reachable:
`npx --yes pnpm@10.0.0 --filter @sfus/api run migration:run`; `migration:show` inspects state.)

## Runtime URLs

| Surface | URL |
|---|---|
| homepage | `http://localhost:3000/` |
| web live / ready | `http://localhost:3000/health/live` · `/health/ready` (static — no dependency checks) |
| API live / ready | `http://localhost:3001/api/health/live` · `/api/health/ready` |
| Swagger (dev) | `http://localhost:3001/api/docs` |
| blog / login / register | `http://localhost:3000/blog` · `/login` · `/register` |
| admin surfaces | `http://localhost:3000/admin/blog` · `/admin/pages` · `/admin/navigation` (admin role) |

API surface details live in the feature docs: [auth](../features/auth.md),
[blog](../features/blog.md), [pages](../features/pages.md),
[navigation](../features/navigation.md), [media](../features/media.md).
