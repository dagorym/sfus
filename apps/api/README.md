# SFUS API foundation

Milestone 1 exposes infrastructure-only API surfaces under the internal `/api` prefix.

## Runtime contract

- host-run local API port: `3001`
- global prefix: `/api`
- liveness: `/api/health/live`
- readiness: `/api/health/ready`
- Swagger: `/api/docs`

Swagger is enabled by default for local development and disabled by default in production unless `API_SWAGGER_ENABLED=true` is provided.

## Environment contract

The API process fails fast when any required variable is missing or invalid.

- `NODE_ENV`: `development`, `test`, or `production`
- `API_PORT`: listener port for the Nest process
- `API_SWAGGER_ENABLED`: explicit Swagger exposure toggle
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`: MySQL connection contract
- `DB_CONNECT_TIMEOUT_MS`: MySQL connect timeout for readiness and migration operations
- `DB_MIGRATIONS_TABLE`: reviewed migration tracking table name

Local development uses the Compose-managed MySQL service. Production uses host-managed environment files outside the repo checkout and must point to an external MySQL 5.7.44 instance.

## Migration contract

Application startup does **not** execute migrations automatically.

Run migrations explicitly after building the API image or TypeScript output:

```bash
pnpm --filter @sfus/api run build
pnpm --filter @sfus/api run migration:run
```

The reviewed Milestone 1 baseline migration is `FoundationBaseline1711843200000`. Readiness reports failure until the database is reachable and that migration has been applied.
