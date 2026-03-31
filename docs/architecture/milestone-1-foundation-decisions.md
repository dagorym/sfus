# Milestone 1 Foundation Decisions

## Purpose
This document records the architectural decisions locked during Milestone 1 planning for the Star Frontiers website foundation. These decisions are inputs to implementation, not topics to be reopened during Milestone 1 execution unless a blocker forces replanning.

## Scope
These decisions govern the deployable foundation milestone only:
- application workspace structure
- runtime and deployment model
- database and migration baseline
- frontend shell and theming baseline
- logging, health, validation, and documentation contracts

They do not authorize Milestone 2+ feature work such as auth, blog, forums, docs, projects, downloads, search, feeds, or Redis-backed jobs.

## Locked Decisions

### Repository And Tooling
- The repo will be a `pnpm` monorepo.
- Primary app locations:
  - `apps/web`
  - `apps/api`
- Shared package scope is minimal in Milestone 1:
  - `packages/config`
- No `packages/ui` package will be created in Milestone 1.
- Node.js baseline is the current active LTS version across local development, CI, and Docker.
- TypeScript runs in strict mode from day one.
- Linting and formatting are repo-wide and shared through `packages/config`.
- No local commit hooks are required in Milestone 1.
- No extra monorepo orchestrator such as Turborepo or Nx will be introduced in Milestone 1.

### Framework Baseline
- Frontend framework: current stable Next.js with App Router.
- Backend framework: current stable NestJS.
- API style: REST only.
- Swagger/OpenAPI is included in Milestone 1 at `/api/docs`.
- Swagger is enabled by default in local development and disabled by default in production unless explicitly enabled.

### Database And Persistence
- ORM and migration tool: TypeORM.
- Migrations must be explicit and reviewed, not treated as blind generated truth.
- All schema and query behavior must remain compatible with MySQL 5.7.44.
- Local development uses a Compose-managed MySQL service with a persistent named volume.
- Production uses an external MySQL 5.7.44 instance rather than a repo-managed production MySQL container.
- Local database name: `sfus`.

### Deferred Infrastructure
- Redis is deferred from Milestone 1.
- Search infrastructure is deferred from Milestone 1.
- Storage abstraction and upload pipelines are deferred from Milestone 1.

### Frontend Styling And UI Scope
- Styling uses CSS Modules plus global CSS custom properties for tokens.
- Milestone 1 supports one default theme only.
- No component library will be introduced in Milestone 1.
- The homepage is static and does not depend on user-visible API data.
- Public pages in scope:
  - `/`
  - branded `404`
  - branded error page
- Navigation includes implemented routes only.
- The footer is minimal.
- No auth UI appears in Milestone 1.
- No placeholder future feature pages or route groups are created in Milestone 1.

### API Routing, Health, And Errors
- The Nest app uses a global internal `/api` prefix.
- API health endpoints:
  - `/api/health/live`
  - `/api/health/ready`
- Frontend health endpoints:
  - `/health/live`
  - `/health/ready`
- Health endpoints return JSON.
- Liveness and readiness are separate concerns.
- API readiness must fail if:
  - the database is unavailable
  - required migrations have not been applied
- API errors follow a standardized JSON shape.

### Logging And Operational Visibility
- Logs are structured JSON in all environments.
- Local developer readability is handled by a pretty-print tool layered on top of the canonical JSON logs.
- Request/correlation IDs are part of the baseline logging contract.

### Local Development Model
- Local development is hybrid by default:
  - `web` runs on the host at `localhost:3000`
  - `api` runs on the host at `localhost:3001`
  - MySQL runs in Compose
- The frontend always targets `/api`.
- Local development uses rewrites so `/api` forwards to the host-run API port.
- Full-stack containerized validation still exists and must be runnable in addition to the hybrid flow.

### Production Deployment Model
- Public production domain: `https://starfrontiers.us`
- Public API base: `https://starfrontiers.us/api`
- Production uses long-lived Compose-managed services on the target host.
- A single production Compose file manages the Milestone 1 stack.
- Production-facing naming uses the `sfus` project identity where practical.
- Internal service names remain:
  - `web`
  - `api`
  - `mysql` where applicable locally
- `web` and `api` do not bind host ports in production-oriented configuration.
- Production container definitions include the metadata needed by the existing `nginx-proxy` integration.
- Production env files and secrets are managed on the host outside the repo checkout.
- Images are built on the target host during deployment.
- Application rollback is git-based on the host.

### Migration Operations
- Migrations are executed explicitly before app rollout.
- Migrations run in a one-off Compose service/container.
- Production schema rollback policy is forward-fix, not reliance on down-migrations.

### Security And Proxy Behavior
- Trusted proxy behavior is explicitly configured for the expected reverse-proxy topology only.
- Milestone 1 includes a baseline security-header/CSP direction.
- CSRF protections are deferred until state-changing browser flows exist.

### Testing And Validation
- Frontend gets a lightweight unit/component test baseline.
- API gets a lightweight unit/integration test baseline.
- Browser E2E is deferred from Milestone 1.
- Scriptable smoke validation is required for:
  - build
  - startup
  - migration execution
  - homepage reachability
  - API health
- CI/CD assets should be updated where needed so the new stack can be built and validated consistently.

### Accessibility And Browser Baseline
- Accessibility requirements in Milestone 1 apply to implemented surfaces only.
- The baseline includes semantic structure, keyboard access, visible focus, and acceptable contrast on in-scope pages/components.
- Browser support targets modern evergreen desktop and mobile browsers only.

## Documentation Expectations
- This document is the durable architecture reference for Milestone 1.
- The implementation plan in `plans/milestone-1-foundation-plan.md` should align with these decisions.
- Root setup and deployment docs must reflect the final implementation of these decisions.
- If implementation reveals a real conflict with one of these decisions, the work should pause for replanning rather than silently drifting.
