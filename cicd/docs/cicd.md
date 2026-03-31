# CI/CD Developer Workflows

## Local pipeline quickstart on this computer

Start in the repository root:

```bash
cd /home/tstephen/repos/sfus
```

Prepare env files first:

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
```

Recommended local pass order:

```bash
bash cicd/scripts/run-validations.sh cicd/config/validation-config.yml
bash cicd/scripts/build-images.sh cicd/config/image-matrix.yml build
bash cicd/scripts/run-containers.sh start
bash cicd/tests/run-validations.sh
```

For hybrid/full-stack and production topology details, see `cicd/docs/local-pipeline.md`.

## Runtime contract artifacts in this repo

- Root env example: `.env.example` (platform/deployment ownership)
- Web env example: `apps/web/.env.example` (web ownership)
- API env example: `apps/api/.env.example` (api ownership)
- Web Docker build: `apps/web/Dockerfile` (multi-stage)
- API Docker build: `apps/api/Dockerfile` (multi-stage)
- Local Compose (hybrid/full validation): `cicd/docker/compose.dev.yml`
- Production Compose (single-file topology): `cicd/docker/compose.prod.yml`

The example env files are safe templates. Production secrets, reverse-proxy env values, and the external production MySQL connection stay host-managed outside the repository checkout.

## Service naming contract

Use service names consistently:

- `web`
- `api`
- `mysql` (where applicable locally)

## Local runtime expectations

`cicd/docker/compose.dev.yml` supports both Milestone 1 local modes:

- default hybrid mode: Compose-managed `mysql` with host-run `web` and `api`
- full-stack validation mode: `web`, `api`, and `mysql` together under the `fullstack` profile

In hybrid mode, the frontend still targets `/api`, and local rewrites forward traffic to the host-run API at `localhost:3001`. In full-stack validation, the web container uses the internal `api` service URL and the API container uses the internal `mysql` hostname.

## Production Compose expectations

`cicd/docker/compose.prod.yml` is the single source for Milestone 1 production container topology.

- long-lived services: `web`, `api`
- no host port bindings
- reverse-proxy metadata present for proxy integration
- explicit one-off migration service: `migrate`

Run production migrations as a separate one-off step before rollout instead of relying on app startup side effects. The `migrate` service is intentionally independent (no `depends_on` on long-lived app services) so it can be executed before bringing up `web` and `api`.

The API image boots a NestJS service that exposes `/api/health/live`, `/api/health/ready`, and `/api/docs` (Swagger remains production-gated by `API_SWAGGER_ENABLED`). `/api/health/live` is a process-only liveness probe. `/api/health/ready` validates the external MySQL connection and the reviewed migration baseline before reporting ready.

## Existing shared runners

Run these commands from repository root:

```bash
bash cicd/scripts/run-validations.sh cicd/config/validation-config.yml
bash cicd/scripts/build-images.sh cicd/config/image-matrix.yml build
bash cicd/scripts/run-containers.sh start
```

- `run-validations.sh` executes validation entries from `cicd/config/validation-config.yml`.
- `build-images.sh ... build` builds image entries from `cicd/config/image-matrix.yml`.
- `run-containers.sh start` uses `cicd/docker/compose.dev.yml` by default.
