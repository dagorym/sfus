# Production Deployment

Production topology, the deploy runbook, post-deploy validation, rollback, and the schema
policy.

**Code:** `cicd/docker/compose.prod.yml`
**Related:** [launch](launch.md) for the env contract · `docs/architecture/
milestone-1-foundation-decisions.md` for the locked deployment decisions

## Topology

`cicd/docker/compose.prod.yml` is the single production Compose definition:

- Long-lived services `web` and `api` (`restart: unless-stopped`); one-off `migrate` service
  behind the `migration` profile.
- **No host port bindings.** Routing goes through the pre-existing shared `nginx-proxy` +
  `acme-companion` stack via the external `nginx-proxy` Docker network and reverse-proxy
  metadata: `VIRTUAL_HOST`/`LETSENCRYPT_HOST` = `SFUS_PUBLIC_HOST` (required at runtime),
  `VIRTUAL_PORT` 3000 (web) / 3001 (api), and `VIRTUAL_PATH=/api` on the api service —
  path-based routing on one domain (`https://starfrontiers.us`, API at `/api`).
- The database is an **external MySQL 5.7.44 instance** — production runs no MySQL container.
- The `sfus_media_uploads` volume is mounted into `api` and `migrate` at
  `/app/storage/uploads`; it must be durable and included in backups.
- Images are built on the target host during deployment; rollback is git-based.

## Host-managed environment

Keep canonical runtime env files outside the checkout, e.g.:

- `/srv/sfus/shared/runtime.env` — root Compose substitutions (`SFUS_PUBLIC_HOST`,
  `LETSENCRYPT_EMAIL`)
- `/srv/sfus/shared/web.env` — web contract
- `/srv/sfus/shared/api.env` — API contract, including the external MySQL connection

The Compose file expects `apps/web/.env` and `apps/api/.env` paths inside the checkout, so
symlink them to the host-managed files before deploying:

```bash
ln -sfn /srv/sfus/shared/web.env apps/web/.env
ln -sfn /srv/sfus/shared/api.env apps/api/.env
```

Variable meanings and constraints: see the contract tables in [launch](launch.md).

## Deploy runbook

From the checked-out worktree on the target host:

```bash
git fetch --tags origin
git checkout <deploy-ref>
docker compose --env-file /srv/sfus/shared/runtime.env -f cicd/docker/compose.prod.yml build web api
docker compose --env-file /srv/sfus/shared/runtime.env -f cicd/docker/compose.prod.yml --profile migration run --rm --no-deps migrate
docker compose --env-file /srv/sfus/shared/runtime.env -f cicd/docker/compose.prod.yml up -d web api
```

Migrations run **before** app rollout as an explicit one-off step; the `migrate` service has
no `depends_on` on the app services, and normal API startup never applies schema changes.

## Post-deploy validation

```bash
curl -fsS https://starfrontiers.us/ >/dev/null
curl -fsS https://starfrontiers.us/api/health/live
curl -fsS https://starfrontiers.us/api/health/ready
docker compose --env-file /srv/sfus/shared/runtime.env -f cicd/docker/compose.prod.yml ps
docker compose --env-file /srv/sfus/shared/runtime.env -f cicd/docker/compose.prod.yml --profile migration run --rm --no-deps migrate node dist/index.js migration:show
```

The deployment is complete only when the homepage responds, API liveness and readiness
succeed, and the migration status check reports no missing reviewed migrations.
(`/api/health/ready` validates DB connectivity and the reviewed migration baseline — see
[api-conventions](../development/api-conventions.md).)

## Rollback & schema policy

Application rollback is git-based:

```bash
git checkout <last-known-good-ref>
docker compose --env-file /srv/sfus/shared/runtime.env -f cicd/docker/compose.prod.yml build web api
docker compose --env-file /srv/sfus/shared/runtime.env -f cicd/docker/compose.prod.yml up -d web api
```

Repeat post-deploy validation afterwards.

Schema handling is **forward-fix only**: do not rely on down-migrations. If a deployment
shipped a bad schema change, ship a new reviewed migration that restores compatibility with
the last good application revision (or the forward-fixed replacement).

## Operational notes

- Session cookies become `Secure` automatically in production (`NODE_ENV=production`); the
  reverse proxy must terminate TLS and forward proto headers per the locked trusted-proxy
  decision.
- Swagger is disabled by default in production; enable explicitly with
  `API_SWAGGER_ENABLED=true` only when needed.
- In production no Next.js `/api` rewrite exists unless `WEB_API_INTERNAL_URL` is set — the
  reverse proxy's `VIRTUAL_PATH=/api` routing is what delivers API traffic
  (see [web-shell](../features/web-shell.md)).
