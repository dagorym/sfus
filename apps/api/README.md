# SFUS API (`@sfus/api`)

NestJS API serving every backend surface under the global `/api` prefix.

## Runtime contract

- host-run local port: `3001`; global prefix: `/api`
- liveness `/api/health/live`; readiness `/api/health/ready` (DB + reviewed-migration checks,
  `503` when not ready)
- Swagger `/api/swagger` (+ `/api/swagger/openapi.json`) — on by default outside production,
  gated by `API_SWAGGER_ENABLED`
- startup **never** runs migrations; `node dist/index.js migration:run` (or the
  `migration:run` script) is the only schema-application path
- the process fails fast when any required env variable is missing or invalid

## Where the documentation lives

Start from the [documentation map](../../docs/README.md) and read the docs matching the
module you are touching:

- cross-cutting contracts (error envelope, logging, health, env validation, migrations):
  [docs/development/api-conventions.md](../../docs/development/api-conventions.md)
- canonical env-variable table: [docs/operations/launch.md](../../docs/operations/launch.md)
- per-module contracts: [auth](../../docs/features/auth.md),
  [authorization](../../docs/features/authorization.md),
  [media](../../docs/features/media.md), [blog](../../docs/features/blog.md),
  [pages](../../docs/features/pages.md), [navigation](../../docs/features/navigation.md)
- tests, including the opt-in DB integration spec:
  [docs/development/testing.md](../../docs/development/testing.md)

## Module layout (`src/`)

`auth/` · `authorization/` · `users/` · `blog/` · `pages/` · `navigation/` · `media/`
(incl. the shared Markdown sanitizer) · `health/` · `database/` (config + reviewed
migrations) · `config/` (env validation) · `common/` (filter, logger, middleware)
