# SFUS API foundation

Milestone 1 exposes infrastructure-only API surfaces under the internal `/api` prefix.

## Runtime contract

- host-run local API port: `3001`
- global prefix: `/api`
- liveness: `/api/health/live`
- readiness: `/api/health/ready`
- Swagger: `/api/docs`

Swagger is enabled by default for local development and disabled by default in production unless `API_SWAGGER_ENABLED=true` is provided.

The Swagger UI also exposes the generated OpenAPI document at `GET /api/docs/openapi.json` when Swagger is enabled.

## Environment contract

The API process fails fast when any required variable is missing or invalid.

- `NODE_ENV`: `development`, `test`, or `production`
- `API_PORT`: listener port for the Nest process
- `API_SWAGGER_ENABLED`: explicit Swagger exposure toggle
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`: MySQL connection contract
- `DB_CONNECT_TIMEOUT_MS`: MySQL connect timeout for readiness and migration operations
- `DB_MIGRATIONS_TABLE`: reviewed migration tracking table name

Local development uses the Compose-managed MySQL service. Production uses host-managed environment files outside the repo checkout and must point to an external MySQL 5.7.44 instance.

## Health and readiness behavior

`GET /api/health/live` is a process liveness probe. It always returns JSON in this shape:

```json
{
  "status": "ok",
  "service": "api",
  "timestamp": "2026-03-31T00:00:00.000Z"
}
```

`GET /api/health/ready` is a dependency-aware readiness probe. It checks database connectivity first, then verifies that every reviewed migration has been applied. The response always includes:

- top-level `status`, `service`, and `timestamp`
- `checks.database.status`
- `checks.migrations.status`
- `checks.migrations.required`
- `checks.migrations.missing`

Readiness returns HTTP `503` when the database is unavailable or any reviewed migration is missing.

## Logging and error contract

- request correlation uses `x-correlation-id`; incoming `x-request-id` is also accepted as the source ID
- responses echo `x-correlation-id`
- successful request logs emit structured JSON with event `request.completed`
- failed request logs emit structured JSON with event `request.failed`

Unhandled API errors return JSON in this shape:

```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred.",
    "statusCode": 500
  },
  "request": {
    "correlationId": "2c6d3f5d-3d3d-4c14-9f45-0c4b5f0d6c10",
    "method": "GET",
    "path": "/api/example",
    "timestamp": "2026-03-31T00:00:00.000Z"
  }
}
```

## Migration contract

Application startup does **not** execute migrations automatically.

Run migrations explicitly after building the API image or TypeScript output:

```bash
pnpm --filter @sfus/api run build
pnpm --filter @sfus/api run migration:run
pnpm --filter @sfus/api run migration:show
```

The reviewed Milestone 1 baseline migration is `FoundationBaseline1711843200000`. Milestone 1 does not create product tables yet; this reviewed baseline establishes explicit migration state for readiness and future schema work.

TypeORM remains MySQL-focused with `utf8mb4`, an explicit migration tracking table, and `migrationsRun: false`, so normal API startup never performs implicit schema changes.
