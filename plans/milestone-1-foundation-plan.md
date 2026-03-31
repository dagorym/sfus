# Milestone 1 Foundation Plan

## Planner Activation
- Requested agent: `Planner`
- Repository-local definition found: no. Repository guidance only points to shared lookup via `/home/tstephen/repos/sfus/AGENTS.md`.
- Shared definition found: yes, `/home/tstephen/repos/agents/agents/planner.md`
- Precedence decision: shared Planner definition won because no repository-local Planner definition exists.
- Workflow obligations being followed:
  - Stay in planning mode only and do not write implementation code.
  - Decompose the milestone into ordered, implementation-ready subtasks with dependencies.
  - Define observable acceptance criteria and documentation impact.
  - Include implementer prompts for each subtask.
  - Write the final plan to a unique markdown file under `plans/`.

## Overview
Milestone 1 establishes the first deployable application foundation for `starfrontiers.us` using the locked platform choices from the design doc and the resolved planning decisions: a `pnpm` monorepo with `apps/web` and `apps/api`, Next.js and NestJS on current stable majors, TypeORM with explicit reviewed migrations, local Compose-backed MySQL for development, external MySQL 5.7.44 for production, and a single-domain deployment model behind the existing `nginx-proxy` reverse proxy.

The milestone ends when a user can reach a responsive public landing page at `https://starfrontiers.us/`, the API is available at `https://starfrontiers.us/api`, both services run through a production-oriented Compose deployment on the target host, migrations are executed explicitly in a one-off container before rollout, and the repo contains the shared UI shell, logging, health, and environment contracts needed for later milestones.

Confirmed repository context:
- The current repo contains planning and CI/CD assets, not an application codebase yet.
- Milestone 1 will therefore create most app paths for the first time.
- Existing likely touchpoints are:
  - `plans/`
  - `cicd/`
  - root setup docs such as `README`
  - new app and architecture paths under the repo root

Locked implementation surfaces:
- `apps/web`
- `apps/api`
- `packages/config`
- root workspace/tooling files
- root and app-specific env example files
- local and production Compose files
- app-local Dockerfiles
- `docs/architecture/milestone-1-foundation-decisions.md`
- setup/deployment/CI-CD documentation updates

## Assumptions And Locked Decisions
Confirmed from the design doc:
- The reverse proxy model is fixed: the project integrates with the existing `nginx-proxy` plus `acme-companion` stack and does not replace it.
- The public production routing contract is path-based on one domain:
  - `https://starfrontiers.us/` for the frontend
  - `https://starfrontiers.us/api` for the backend
- Milestone 1 is foundation-only and excludes auth, blog, forums, docs, downloads, projects, search, and feed behavior except where shell support is structurally required.

Locked architectural decisions for Milestone 1:
1. Repository layout: `pnpm` monorepo with `apps/web`, `apps/api`, and `packages/config`; no `packages/ui` yet.
2. Framework baseline: current stable Next.js App Router and current stable NestJS; REST only.
3. Persistence stack: TypeORM with explicit reviewed migrations; schema and queries must remain MySQL 5.7.44-safe.
4. Database topology:
   - local development uses a Compose-managed MySQL service with a persistent named volume
   - production uses an external MySQL 5.7.44 instance
5. Deferred services: Redis and search are out of Milestone 1.
6. Styling baseline: CSS Modules plus global CSS custom properties for tokens; no component library.
7. Public page scope:
   - homepage `/`
   - branded `404`
   - branded error page
   - no auth UI
   - nav shows implemented routes only
   - footer is minimal
8. Theme scope: one default theme only.
9. Homepage behavior: static content only; no user-visible API-driven UI.
10. Local development model:
   - hybrid mode by default
   - `web` on `localhost:3000`
   - `api` on `localhost:3001`
   - frontend code targets `/api` with local rewrites forwarding to the API port
11. Production deployment model:
   - long-lived Compose-managed services on the target host
   - images built on the host during deployment
   - single production Compose file
   - no host port binding for `web` or `api`
   - reverse proxy metadata included in production container definitions
   - host-managed env/secrets outside the repo checkout
   - rollback is git-based on the host
12. Migration operations:
   - explicit migration step before app rollout
   - migrations run in a one-off Compose service/container
   - production rollback policy is forward-fix for schema changes
13. Logging baseline:
   - structured JSON everywhere
   - local pretty-printer for developer readability
   - request/correlation IDs included
14. Health contract:
   - frontend health at `/health/live` and `/health/ready`
   - API health at `/api/health/live` and `/api/health/ready`
   - readiness is separate from liveness
   - API readiness fails if DB is unavailable or required migrations are unapplied
   - health responses return JSON
15. API contracts:
   - global internal `/api` prefix in Nest
   - Swagger at `/api/docs`
   - Swagger enabled locally by default and disabled in production unless explicitly enabled
   - standardized JSON error responses
16. Tooling quality baseline:
   - current active LTS Node.js
   - strict TypeScript
   - shared lint/format config in `packages/config`
   - no commit hooks in Milestone 1
   - lightweight frontend and API test baselines
   - no browser E2E in Milestone 1
17. Accessibility and browser baseline:
   - accessibility applies to implemented Milestone 1 surfaces only
   - modern evergreen browsers only

Planning assumptions still in effect:
- Static branding assets are bundled with the frontend; no upload/storage abstraction implementation yet.
- Security headers/CSP baseline belongs in Milestone 1, while CSRF protections wait for later state-changing browser flows.
- Root setup/use documentation is in scope; licensing changes are not.

## Workstreams
1. Architecture record and workspace bootstrap
   - Create the monorepo, shared config package, strict TypeScript baseline, unified lint/format/test entrypoints, and architecture decision record.
2. Container and deployment foundation
   - Add app-local Dockerfiles, local and production Compose files, proxy metadata, host-oriented deployment scripts/validation, and env file contracts.
3. API foundation
   - Stand up NestJS with config validation, JSON logging, correlation IDs, health/readiness endpoints, Swagger, TypeORM, and baseline migrations.
4. Frontend shell foundation
   - Stand up Next.js with tokens, CSS Module styling, responsive layout shell, homepage, footer, `404`, and error pages.
5. Validation and operational safety
   - Add smoke checks, lightweight app tests, migration execution flow, deployment validation, and rollback documentation.

## Ordered Implementation Steps
1. Record the locked architecture decisions and bootstrap the monorepo.
   - Scope:
     - Create `docs/architecture/milestone-1-foundation-decisions.md`.
     - Create the `pnpm` monorepo structure with `apps/web`, `apps/api`, and `packages/config`.
     - Add shared TypeScript, lint, and formatting configuration.
     - Define the Node.js baseline and root workspace scripts.
   - Dependencies: none.
   - Acceptance criteria:
     - The architecture decision record captures the locked Milestone 1 decisions without unresolved architecture placeholders.
     - The repo installs as a `pnpm` workspace and exposes root commands for build, lint, typecheck, and test.
     - `packages/config` owns shared config, and no speculative `packages/ui` package is created.
   - Documentation impact:
     - Add the architecture record and update root setup docs to describe the monorepo/tooling baseline.

2. Define environment contracts and runtime file layout.
   - Scope:
     - Add root and app-specific env example files.
     - Define variable ownership between root, `apps/web`, and `apps/api`.
     - Document the production secret model using host-managed env files outside the repo checkout.
   - Dependencies: Step 1.
   - Acceptance criteria:
     - Example env files exist for root, web, and API scopes.
     - Required variables are documented without secrets.
     - The docs explain local versus production loading expectations and the external production DB contract.
   - Documentation impact:
     - Setup/deployment docs must describe env ownership, secret handling, and local/production differences.

3. Add local and production-oriented Compose topology plus per-app Dockerfiles.
   - Scope:
     - Create one multi-stage Dockerfile for `apps/web` and one for `apps/api`.
     - Create local Compose definitions supporting hybrid dev and full-stack validation.
     - Create a single production Compose definition for `web` and `api`, including reverse proxy metadata and the one-off migration service.
     - Use service names `web`, `api`, and `mysql`; use `sfus` as the project/image naming root where appropriate.
   - Dependencies: Steps 1-2.
   - Acceptance criteria:
     - Local Compose starts at least MySQL and supports full-stack validation of web and API.
     - Production Compose does not expose host ports for `web` or `api`.
     - Production definitions include the metadata needed by the existing `nginx-proxy`.
     - Production and local docs clearly distinguish host-run app development from full containerized validation.
   - Documentation impact:
     - Deployment docs must describe local hybrid usage, full Compose validation, and production service ownership.

4. Stand up the API foundation.
   - Scope:
     - Create the infrastructure-only NestJS module structure needed for config, health, DB, logging, and Swagger.
     - Add strict environment validation.
     - Add structured JSON logging and request/correlation IDs.
     - Set the global internal `/api` prefix.
     - Add standardized JSON error handling.
   - Dependencies: Steps 1-3.
   - Acceptance criteria:
     - The API boots with validated env configuration and fails fast on invalid config.
     - `/api/health/live`, `/api/health/ready`, and `/api/docs` exist according to the locked contract.
     - Swagger is available locally and gated in production by config.
     - API errors and request logs follow a consistent JSON shape with correlation IDs.
   - Documentation impact:
     - API docs must define health, error, logging, and Swagger exposure behavior.

5. Add TypeORM and migration readiness behavior.
   - Scope:
     - Configure TypeORM for local MySQL and external production MySQL.
     - Add the initial reviewed migration and migration commands.
     - Implement readiness behavior that fails when DB connectivity or required migration state is not satisfied.
     - Define the explicit migration command/service used in deployment.
   - Dependencies: Step 4.
   - Acceptance criteria:
     - A clean local DB can be migrated successfully.
     - The API connects correctly to both the local and documented production DB contract.
     - Readiness fails if the DB is unavailable or required migrations are missing.
     - Migration execution is explicit and runs in a one-off Compose service/container, not as implicit app startup behavior.
   - Documentation impact:
     - Database setup, migration execution, and forward-fix rollback expectations must be documented.

6. Stand up the frontend shell and design token system.
   - Scope:
     - Create the Next.js app in `apps/web`.
     - Add global CSS custom properties for tokens and CSS Module-based styling.
     - Implement the responsive shell, minimal nav, minimal footer, homepage, `404`, and error page.
     - Omit auth controls and future feature placeholders.
   - Dependencies: Steps 1-2. Compose verification depends on Step 3.
   - Acceptance criteria:
     - The frontend runs locally on `localhost:3000`.
     - The shell is responsive and uses centralized tokens.
     - Navigation only contains implemented destinations.
     - The homepage is static and branded, and `404` plus error pages are present.
   - Documentation impact:
     - Frontend docs should describe token ownership, shell conventions, and in-scope public routes.

7. Wire local rewrites and production routing assumptions.
   - Scope:
     - Configure the frontend so app code targets `/api`.
     - Add local development rewrites from `/api` to `localhost:3001`.
     - Ensure API trusted-proxy behavior matches the production reverse proxy topology only.
   - Dependencies: Steps 4-6.
   - Acceptance criteria:
     - Local frontend-to-API calls can work through `/api` without changing frontend fetch paths between local and production.
     - Production assumptions are documented for `https://starfrontiers.us/` and `https://starfrontiers.us/api`.
     - Proxy trust is explicit rather than broadly enabled.
   - Documentation impact:
     - Deployment docs must define route, proxy-header, and local rewrite behavior.

8. Add tests, smoke checks, and deployment validation.
   - Scope:
     - Add lightweight frontend unit/component tests.
     - Add lightweight API unit/integration tests focused on config and health/readiness behavior.
     - Add scriptable smoke validation for build, startup, migrations, homepage reachability, and API health.
     - Update CI/CD assets as needed so the new stack can be built and validated.
   - Dependencies: Steps 3-7.
   - Acceptance criteria:
     - Frontend and API each have a functioning baseline test harness.
     - No browser E2E suite is introduced.
     - A validation flow exists for local and deploy-time checks, including migration execution and post-deploy health verification.
     - Existing `cicd/` assets are updated where necessary to support the new stack.
   - Documentation impact:
     - CI/CD and validation docs must explain how to run milestone checks locally and in deployment workflows.

9. Finalize deployment and rollback documentation.
   - Scope:
     - Document host-based deployment using long-lived Compose services.
     - Document on-host image builds, host-managed env files, git-based rollback, and forward-fix migration policy.
     - Document the migration service/container step explicitly in the release flow.
   - Dependencies: Steps 3-8.
   - Acceptance criteria:
     - A deploy operator can follow the docs to update the repo on the host, run migrations, rebuild, restart, and validate the stack.
     - Rollback docs clearly separate application rollback from schema forward-fix expectations.
     - Documentation matches the actual Compose and app behavior implemented in Milestone 1.
   - Documentation impact:
     - Root setup/deploy docs and any `cicd/` operational docs must be updated to reflect the final release model.

## Acceptance Criteria
Milestone 1 is complete when all of the following are true:
- The repo contains a `pnpm` monorepo with `apps/web`, `apps/api`, and `packages/config`.
- The frontend and API run on the locked stack and route contract:
  - local development at `localhost:3000` and `localhost:3001`
  - production at `https://starfrontiers.us/` and `https://starfrontiers.us/api`
- Local development supports a hybrid workflow, while Compose also supports full-stack validation.
- Production-oriented deployment uses one Compose file, long-lived `web` and `api` services, reverse-proxy metadata, no host port binding, and host-managed env files outside the repo checkout.
- The API exposes:
  - `/api/health/live`
  - `/api/health/ready`
  - `/api/docs`
  - strict env validation
  - structured JSON logs with correlation IDs
  - standardized JSON errors
  - TypeORM with explicit reviewed migrations
- The API readiness contract fails on unavailable DB or unapplied required migrations.
- The frontend exposes a responsive shell with a static homepage, minimal nav, minimal footer, branded `404`, branded error page, one default theme, and centralized CSS-variable design tokens.
- Redis, search, auth UI, feature placeholders, and browser E2E remain out of scope.
- Lightweight frontend and API test baselines exist, along with scriptable smoke validation and CI/CD updates needed to build and validate the new stack.
- Deployment and rollback documentation covers:
  - on-host builds
  - one-off migration container execution
  - post-deploy validation
  - git-based app rollback
  - forward-fix schema policy

Overall documentation impact:
- Add `docs/architecture/milestone-1-foundation-decisions.md` as the durable architecture source for this milestone.
- Update root setup/deployment documentation because this milestone creates the first runnable application stack.
- Update CI/CD docs or scripts where they become the natural home for build/validation behavior.

## Dependency Ordering
- Must happen first:
  - Step 1
  - Step 2
- Platform runtime foundation:
  - Step 3 depends on Steps 1-2
- API path:
  - Step 4 depends on Steps 1-3
  - Step 5 depends on Step 4
- Frontend path:
  - Step 6 depends on Steps 1-2
  - Step 7 depends on Steps 4-6
- Validation and release safety:
  - Step 8 depends on Steps 3-7
  - Step 9 depends on Steps 3-8

Parallelization notes:
- Step 3 and Step 6 can proceed in parallel after Steps 1-2 are complete.
- Step 4 can begin while frontend shell work is in progress.
- Step 8 should wait until both app foundations and routing assumptions are in place.

## Risks And Mitigations
1. Reverse proxy integration drifts from the actual host environment.
   - Mitigation: keep reverse-proxy metadata explicit in production Compose, validate trusted-proxy behavior, and test the exact `/` and `/api` route contract after deployment.
2. TypeORM or migration work introduces MySQL 8.0 assumptions.
   - Mitigation: review migrations manually, validate SQL against MySQL 5.7.44 expectations, and avoid convenience features that assume newer server capabilities.
3. Hybrid local development masks container-only issues.
   - Mitigation: require a full-stack containerized validation path in addition to host-run day-to-day development.
4. Host-built deployment weakens reproducibility or rollback speed.
   - Mitigation: document deployed commit SHAs, keep git-based rollback explicit, and ensure rebuild/restart/validate steps are deterministic.
5. Early milestone scope creeps into future feature domains.
   - Mitigation: enforce the locked out-of-scope list and reject auth, content-domain, Redis, and search implementation work in Milestone 1.
6. Migration failures block rollout.
   - Mitigation: keep the first migration minimal, run migrations explicitly in a one-off container, and preserve the forward-fix policy for production schema issues.

## Implementer Agent Prompts

### Subtask 1: Architecture record and monorepo bootstrap
```text
You are the implementer agent.

Allowed files:
- Root workspace files such as pnpm/workspace config, tsconfig, lint/format configs, ignore files
- `apps/web`
- `apps/api`
- `packages/config`
- Root setup docs
- `docs/architecture/milestone-1-foundation-decisions.md`

Task:
Bootstrap the Milestone 1 monorepo exactly to the locked planner decisions. Create `apps/web`, `apps/api`, and `packages/config`; add the shared toolchain baseline; and record the locked architecture decisions in the milestone decision document.

Acceptance criteria:
- The repo is a working `pnpm` monorepo with `apps/web`, `apps/api`, and `packages/config`.
- Shared TypeScript, lint, and format config are centralized in `packages/config`.
- No speculative future packages or feature placeholders are created.
- The milestone decision document reflects the locked architectural decisions without unresolved architecture questions.
```

### Subtask 2: Env contracts and container topology
```text
You are the implementer agent.

Allowed files:
- Root and app-specific env example files
- Dockerfiles
- Local and production Compose files
- Deployment/setup docs
- CI/CD scripts or docs if needed for stack startup/build

Task:
Implement the locked Milestone 1 runtime contract: root and app-specific env examples, one multi-stage Dockerfile per app, local Compose for hybrid/full validation support, and one production Compose file with reverse-proxy metadata, no host port binding, and an explicit migration service.

Acceptance criteria:
- Root plus app-specific env example files exist and document variable ownership.
- `web`, `api`, and `mysql` service naming is used consistently where applicable.
- Production Compose uses a single file, long-lived `web` and `api` services, no host port binding, and reverse-proxy metadata.
- The migration path is represented as an explicit one-off container/service rather than implicit app startup logic.
```

### Subtask 3: API foundation and migration baseline
```text
You are the implementer agent.

Allowed files:
- `apps/api/**`
- Root workspace/config files if API tooling integration requires them
- API env example files
- API docs and deployment docs relevant to API behavior

Task:
Create the infrastructure-only NestJS foundation for Milestone 1 with strict env validation, structured JSON logs, correlation IDs, `/api` global prefix, `/api/health/live`, `/api/health/ready`, `/api/docs`, standardized JSON errors, TypeORM, and the initial reviewed migration plus readiness checks tied to DB and migration state.

Acceptance criteria:
- The API boots only with valid env configuration and fails fast on invalid/missing required values.
- Swagger is served at `/api/docs` locally and is production-gated by config.
- Health endpoints return JSON and readiness fails on unavailable DB or missing required migrations.
- TypeORM is configured for local MySQL and the documented external production MySQL contract.
- Migration execution is explicit and not performed automatically on normal app startup.
```

### Subtask 4: Frontend shell and public landing experience
```text
You are the implementer agent.

Allowed files:
- `apps/web/**`
- Root workspace/config files if frontend integration requires them
- Frontend env example files
- Frontend docs

Task:
Create the Milestone 1 Next.js frontend with CSS Modules, global CSS custom-property tokens, one default theme, responsive shell, implemented-links-only navigation, minimal footer, static homepage, branded `404`, branded error page, and local `/api` rewrites to the host-run API port.

Acceptance criteria:
- The frontend runs locally on `localhost:3000`.
- Frontend code targets `/api`, with local rewrites forwarding to `localhost:3001`.
- The homepage is static and branded.
- Navigation includes only implemented destinations, and auth UI is absent.
- `404` and error pages exist and use the shared shell/theme conventions.
```

### Subtask 5: Validation, CI/CD updates, and deploy/rollback documentation
```text
You are the implementer agent.

Allowed files:
- Test files for `apps/web` and `apps/api`
- Validation scripts
- CI/CD scripts and docs
- Root setup/deployment docs

Task:
Add the Milestone 1 validation and operational layer: lightweight frontend/API tests, scriptable smoke validation, CI/CD updates needed to build and validate the new stack, deployment instructions for on-host builds and one-off migration execution, and rollback docs for git-based app rollback plus forward-fix schema policy.

Acceptance criteria:
- Frontend and API both have a functioning baseline test harness.
- Scriptable smoke validation covers build, startup, migration execution, homepage reachability, and API health.
- CI/CD assets are updated where needed to support the new app stack.
- Deployment docs describe host-managed env files, on-host image builds, explicit migration execution, post-deploy validation, git-based rollback, and forward-fix schema behavior.
```

## Output Artifact
- Written plan path: `/home/tstephen/repos/sfus/plans/milestone-1-foundation-plan.md`
