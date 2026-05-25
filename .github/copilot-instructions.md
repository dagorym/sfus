# Copilot Instructions

## Build, test, and lint

- Run commands from the repository root.
- Prefer `npx --yes pnpm@10.0.0 ...` for workspace commands; the repo docs assume `pnpm` may not be installed globally.
- Full workspace commands:
  - `npx --yes pnpm@10.0.0 build`
  - `npx --yes pnpm@10.0.0 lint`
  - `npx --yes pnpm@10.0.0 typecheck`
  - `npx --yes pnpm@10.0.0 test`
- Run a single Vitest file with package filtering instead of the root `test` script:
  - Web: `npx --yes pnpm@10.0.0 --filter @sfus/web exec vitest run app/public-shell.spec.ts`
  - API: `npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run src/health/health.controller.test.ts`
- CI/CD and runtime validation entrypoints:
  - `bash cicd/scripts/run-validations.sh cicd/config/validation-config.yml`
  - `bash cicd/scripts/smoke-validate.sh`
  - `bash cicd/tests/run-validations.sh`
- Before manual Compose-based runtime work, create local env files from the checked-in examples:
  - `cp .env.example .env`
  - `cp apps/web/.env.example apps/web/.env`
  - `cp apps/api/.env.example apps/api/.env`

## High-level architecture

- This is a `pnpm` monorepo with two app workspaces and one shared config package:
  - `apps/web`: Next.js 15 App Router frontend shell
  - `apps/api`: NestJS 11 REST API
  - `packages/config`: shared TypeScript, ESLint, and Prettier baselines
- `cicd/` owns the operational contract. GitHub workflows are thin shims; the real CI/CD behavior lives in `cicd/config/*.yml` and `cicd/scripts/*.sh`.
- The frontend always targets `/api`, not a hard-coded host. `apps/web/next.config.mjs` rewrites `/api/:path*` to `WEB_API_ORIGIN` during local development (default `http://localhost:3001`) and to `WEB_API_INTERNAL_URL` for non-development/containerized routing.
- The API sets a global `/api` prefix in `apps/api/src/index.ts`. Swagger lives at `/api/docs` when enabled.
- Health is split between liveness and readiness:
  - Web: `/health/live`, `/health/ready`
  - API: `/api/health/live`, `/api/health/ready`
- API readiness is not just process health. `ReadinessService` checks both database connectivity and whether every reviewed TypeORM migration has been applied.
- TypeORM is configured for MySQL 5.7 compatibility. Migrations are explicit operational steps (`migration:run`, `migration:show`); normal API startup never runs migrations automatically.
- Local runtime has two modes:
  - default hybrid mode: host-run `web` on `localhost:3000`, host-run `api` on `localhost:3001`, MySQL in Compose
  - full-stack validation mode: `web`, `api`, and `mysql` together via `cicd/docker/compose.dev.yml --profile fullstack`
- Production uses `cicd/docker/compose.prod.yml` for long-lived `web` and `api` services plus a one-off `migrate` service.

## Key conventions

- The active repository instruction system is `.myteam/`, not `AGENTS.md`. At the start of a session, run `myteam get role` (or a specific role) and treat the loaded role and skills as the operative repository guidance.
- For Copilot cloud-agent browser tasks, prefer the built-in Playwright MCP server against locally started app surfaces (`localhost` / `127.0.0.1`). It is available by default in cloud-agent sessions, so the main repo-side need is making sure the environment can install and run this workspace cleanly.
- Milestone 1 scope is intentionally narrow. The web app is a static branded shell with a homepage, branded `404`, branded error page, implemented navigation only, and one theme. Do not add auth UI, speculative routes, or placeholder future pages unless the task explicitly expands scope.
- Keep shared tooling conventions centralized in `packages/config`; avoid introducing app-specific lint, TypeScript, or formatting behavior unless the shared config changes too.
- API logging and error handling are structured JSON contracts, not ad hoc strings:
  - correlation IDs come from `x-correlation-id` or `x-request-id`
  - responses echo `x-correlation-id`
  - successful requests log `request.completed`
  - failed requests log `request.failed`
  - unhandled errors go through the JSON envelope from `JsonExceptionFilter`
- API environment loading is fail-fast. `loadEnvironment()` validates required values and loads env files from `apps/api/.env`, root `.env`, and the bundled fallback path unless `SFUS_API_ENV_FILE` overrides that behavior.
- When changing architecture, launch flow, or deferred-scope decisions, check the repo docs that are treated as maintained references here:
  - `docs/README.md`
  - `docs/website-launch-guide.md`
  - `docs/deferred-tasks.md`
