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

No additional value changes are required to boot the default local full-stack launch.
Provider-based Google/GitHub sign-in still needs real provider credentials and reachable
callback URLs in `apps/api/.env` before those external auth flows will work end to end.

The default local config contracts are:

- `.env`
  - `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`
  - optional host metadata, `LOCAL_API_ORIGIN`, and optional `WEB_HOST_PORT` / `API_HOST_PORT` / `MYSQL_HOST_PORT` overrides
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
  - `AUTH_GOOGLE_CLIENT_ID` / `AUTH_GOOGLE_CLIENT_SECRET` / `AUTH_GOOGLE_CALLBACK_URL` (required for working Google sign-in; placeholders still allow the stack to boot)
  - `AUTH_GITHUB_CLIENT_ID` / `AUTH_GITHUB_CLIENT_SECRET` / `AUTH_GITHUB_CALLBACK_URL` (required for working GitHub sign-in; placeholders still allow the stack to boot)
  - `MEDIA_UPLOAD_MAX_SIZE_BYTES=5242880` (integer 1024–20971520; maximum accepted upload size in bytes)
  - `MEDIA_ALLOWED_MIME_TYPES=image/jpeg,image/png,image/gif,image/webp` (comma-separated list of accepted MIME types; at least one required)
  - `MEDIA_STORAGE_PATH=./storage/uploads` (local filesystem path for uploaded files; use an absolute path on a durable volume in production)
  - `DB_HOST=127.0.0.1` for host-run hybrid development
  - `DB_PORT=3306` or the published `MYSQL_HOST_PORT` value from the root `.env`
  - `DB_NAME=sfus`
  - `DB_USER=sfus`
  - `DB_PASSWORD=changeme-app`

Set the external callback URLs to the public API routes that providers can reach, typically `https://<public-host>/api/auth/external/google/callback` and `https://<public-host>/api/auth/external/github/callback` in deployed environments.

For the full-stack container path, the Compose file overrides the API container
database connection to `DB_HOST=mysql` and `DB_PORT=3306`. Those container-only
values should not be copied into a host-run hybrid API process.

The full-stack Compose files (`compose.dev.yml` and `compose.prod.yml`) mount the `sfus_media_uploads` named Docker volume into the `api` container at `/app/storage/uploads` and set `MEDIA_STORAGE_PATH=/app/storage/uploads` automatically. When running the containerized stack you do not need to set `MEDIA_STORAGE_PATH` in `apps/api/.env`; the Compose environment override takes precedence. The named volume persists uploaded files across container restarts and image rebuilds. In production, ensure this volume is backed by durable storage and included in backup and disaster-recovery procedures.

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

- `POST /api/auth/register` creates a local account, stores the password with Argon2id plus the configured password pepper, returns an email-verification requirement on success, rejects invalid input with `400`, and rejects duplicate email or username attempts with `409`.
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

The media API surface is available under `/api/media`:

- `POST /api/media/upload?resourceType=<type>` — uploads an image for use in Milestone 3 content. Requires an active `sfus_session` cookie. Role-scoped: `blog-post` and `standalone-page` uploads require the `admin` global role; `blog-comment` uploads require any authenticated user. Returns `{ id, storageKey, url, mimeType, sizeBytes, originalFilename, createdAt }`.
- `GET /api/media/:id` — serves a stored media file by UUID. **Public** — no authentication required. The response includes `Content-Type`, `Content-Length`, and `Cache-Control: public, max-age=31536000, immutable` headers.

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

- branded homepage at `/` that frames the current web shell as the Milestone 2 auth-enabled foundation
- branded `404` handling for unknown routes
- branded runtime error surface
- sign-in entry page at `/login` for returning users (local password or external provider)
- registration page at `/register` that promotes Google/GitHub account creation first and keeps local email/password registration as an explicit fallback
- MFA challenge handling in `/login` for both password and external flows, including authenticator-code or recovery-code completion before session issuance
- local registration flow at `/register` that can auto-verify the development token and attempt immediate sign-in
- authenticated shell/profile/settings routes now use one shared client authorization-state resolver (`resolveProtectedSession`) for unauthenticated and onboarding-required handling
- authenticated shell route at `/app` that redirects unauthenticated users to `/login?next=/app` and first-login users to `/onboarding/username`
- authenticated profile route at `/profile` backed by `/api/auth/profile` and redirected to `/login?next=/profile` when unauthenticated
- authenticated settings route at `/settings` backed by `/api/auth/settings` and redirected to `/login?next=/settings` when unauthenticated
- username onboarding page at `/onboarding/username` that posts the final username and returns the user to `/app`
- public blog index at `/blog` and individual post pages at `/blog/:slug` — no authentication required; only published posts and their visible comments are shown
- comment form on `/blog/:slug` — visible to authenticated members only; submits to `POST /api/blog/:postId/comments`
- admin blog management at `/admin/blog`, `/admin/blog/new`, and `/admin/blog/:id/edit` — requires an active session with the global `admin` role
- public standalone page view at `/pages/:slug` — no authentication required; only published pages are shown
- admin standalone page management at `/admin/pages`, `/admin/pages/new`, and `/admin/pages/:id/edit` — requires an active session with the global `admin` role
- admin navigation management at `/admin/navigation` — requires an active session with the global `admin` role; create, toggle, reorder, and delete navigation items

## Blog Content Management

### Guest Access

Guests and unauthenticated users can browse the public blog at:

- `http://localhost:3000/blog` — lists all published posts
- `http://localhost:3000/blog/<slug>` — reads a single published post

Draft and unpublished posts are never returned by the public API endpoints. A request for a non-published slug returns a "Post not found" message.

### Publishing a Blog Post (Admin)

To create and publish a blog post, you need an account whose global role is `admin`.

1. Sign in at `http://localhost:3000/login`.
2. Navigate to `http://localhost:3000/admin/blog`.
3. Click **New post** to open the creation form.
4. Fill in Title, Slug (lowercase hyphenated, e.g. `my-first-post`), optional Tags (comma-separated), and Body (Markdown).
5. Click **Create draft**. The new post is created with `draft` status and the editor opens.
6. In the editor, click **Publish now** to publish immediately. A post with a future `published_at` time is treated as published once that time is reached.

Published posts appear immediately on the public `/blog` index.

### Blog Comments

#### Reading Comments (Public)

Comments are publicly readable on any published blog post page. The comment list loads automatically at `/blog/:slug` after the post body renders. No session or credentials are required.

#### Posting a Comment (Authenticated Members)

Any authenticated user may leave a comment on a published post:

1. Sign in at `http://localhost:3000/login`.
2. Navigate to any published blog post at `http://localhost:3000/blog/<slug>`.
3. A **Leave a comment** form appears below the post body. Write your comment using the Markdown editor.
4. Optionally click **Attach image** to upload a supported image. Enter alt text in the provided field before uploading; the image is inserted into the comment body as `![altText](url)` automatically.
5. Click **Post comment**. The comment appears in the comments list immediately.

Comments are rejected if the body is empty or contains unsafe HTML/script content (the API enforces the shared Markdown sanitizer).

#### Moderating Comments (Moderator / Admin)

Moderators and admins can manage comments through the API. These routes require an active `sfus_session` cookie with the global `moderator` or `admin` role:

- `GET /api/blog/moderation/comments/:postId` — list all comments regardless of status.
- `PATCH /api/blog/moderation/comments/:commentId/status` — set status to `visible`, `hidden`, or `removed`. Body: `{ "status": "hidden" }`.
- `DELETE /api/blog/moderation/comments/:commentId` — permanently delete a comment.

Only `visible` comments are returned by the public comment listing endpoint; `hidden` and `removed` comments are invisible to guests and regular members.

### Admin Blog API

For direct API access (e.g. scripting or integration tests), the admin blog surface is at `/api/blog/admin/posts`. All requests must include the `sfus_session` cookie. See `docs/README.md` under "Blog Publishing Lifecycle" and "Blog Comments" for the full route list and response shapes.

## Standalone Pages Content Management

Standalone pages are admin-managed site pages such as About, Rules, and Contact. They support revision history and restore. They do not include a block-builder UI, wiki hierarchy, or broader documents behavior.

### Guest Access

Guests and unauthenticated users can browse published standalone pages at:

- `http://localhost:3000/pages/<slug>` — reads a single published page

Draft and unpublished pages are never returned by the public API endpoint. A request for a non-published slug returns a "not published" message.

### Managing Standalone Pages (Admin)

To create and publish a standalone page, you need an account whose global role is `admin`.

1. Sign in at `http://localhost:3000/login`.
2. Navigate to `http://localhost:3000/admin/pages`.
3. Click **New page** to open the creation form.
4. Fill in Title, Slug (lowercase hyphenated, e.g. `about-us`), and Body (Markdown).
5. Click **Create draft**. The new page is created with `draft` status and the editor opens.
6. In the editor, click **Publish now** to publish immediately, or **Unpublish** to revert a published page to unpublished status.

Published pages appear immediately at `/pages/<slug>`.

### Revision History and Restore

Every save on the edit page creates a new revision. The **Revision History** panel on the edit page lists all prior revisions with revision number, author, and creation timestamp. For each revision:

- **Preview** — renders the revision body inline using `MarkdownRenderer`.
- **Restore** — creates a new revision from the selected prior revision's title and body and sets it as current. The prior revision remains in the history; restore never overwrites existing revision records.

### Admin Pages API

For direct API access, the admin pages surface is at `/api/pages/admin/pages`. All requests must include the `sfus_session` cookie. See `docs/README.md` under "Standalone Pages" for the full route list and response shapes.

## Navigation Management

Site navigation is dynamically driven by the `navigation_items` database table. Admins can create, reorder, and control the visibility of nav items through the admin UI or the API. The public shell fetches nav items on each route change, so updates are reflected immediately on the next page load without a deployment.

### Guest and Authenticated Nav API

Two read-only endpoints are publicly reachable:

- `GET /api/navigation/items/public` — returns active items with `visibility = "public"`, ordered by `sortOrder` ascending, with one level of children. No credentials required.
- `GET /api/navigation/items/authenticated` — returns all active items (both `public` and `authenticated` visibility), ordered by `sortOrder` ascending, with one level of children. Called when a session is present.

### Managing Navigation Items (Admin)

To manage navigation items, you need an account whose global role is `admin`.

1. Sign in at `http://localhost:3000/login`.
2. Navigate to `http://localhost:3000/admin/navigation`.
3. Use the **Add Navigation Item** form to create a new item. Fields:
   - **Label** — display text for the link.
   - **URL** — destination path or URL (e.g. `/blog`).
   - **Link Type** — `Internal` (same-site Next.js `<Link>`) or `External`.
   - **Visibility** — `Public` (shown to all) or `Authenticated only` (hidden from guests).
   - **Sort Order** — lower numbers appear first; items at the same level are sorted ascending by this value.
   - **Parent (optional)** — select a top-level item to nest this item under it. Only one level of nesting is supported; children cannot themselves be selected as parents.
4. Use the **Show / Hide** toggle to make items active or inactive without deleting them.
5. Use the **↑ / ↓** buttons to swap sort-order values between adjacent siblings.
6. Use the **Delete** button to permanently remove an item. Child items are automatically removed via database cascade.

### Admin Navigation API

For direct API access, the admin navigation surface is at `/api/navigation/admin`. All requests must include the `sfus_session` cookie. See `docs/README.md` under "Admin Navigation (Milestone 3 Subtask 6)" for the full route list, field constraints, nesting rules, and response shapes.

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

To run a single Vitest file, filter to the owning workspace instead of the root `test` script:

```bash
# API
npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run src/health/health.controller.test.ts
# Web
npx --yes pnpm@10.0.0 --filter @sfus/web exec vitest run app/public-shell.spec.ts
```

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
