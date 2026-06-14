# Documentation Map

This is the routing table for all repository documentation. **Read only the docs whose scope
matches your task** — map the code paths you are touching to the rows below, read those docs,
and skip the rest.

## Feature docs — current-state contracts per subsystem

| Doc | Scope | Read when touching |
|---|---|---|
| [features/auth.md](features/auth.md) | identity, registration, email verification, sessions, MFA, external providers, onboarding, profile/settings | `apps/api/src/auth/`, `apps/api/src/users/`, `apps/web/app/{login,register,onboarding,profile,settings}/`, `apps/web/app/auth-client.ts` |
| [features/authorization.md](features/authorization.md) | global roles, ACL grants, decision contract, per-feature admin/moderation gates | `apps/api/src/authorization/`, any `assert*Access` gate, any new protected surface |
| [features/media.md](features/media.md) | image upload/serve API, Markdown sanitizer, authoring web components | `apps/api/src/media/`, `apps/web/components/{image-upload,markdown-*}.tsx`, any content write path |
| [features/blog.md](features/blog.md) | blog posts, publishing lifecycle, comments, moderation | `apps/api/src/blog/`, `apps/web/app/blog/`, `apps/web/app/admin/blog/` |
| [features/pages.md](features/pages.md) | standalone pages, revisions/restore, reserved slugs | `apps/api/src/pages/`, `apps/web/app/pages/`, `apps/web/app/[slug]/`, `apps/web/app/admin/pages/` |
| [features/navigation.md](features/navigation.md) | nav items, visibility + publication-leak filtering, shell rendering | `apps/api/src/navigation/`, `apps/web/components/navigation.tsx`, `apps/web/app/admin/navigation/` |
| [features/forums.md](features/forums.md) | forum categories and boards — admin management API, scoping/visibility model, reorder contract | `apps/api/src/forums/` |
| [features/documents.md](features/documents.md) | wiki page tree, read API (path resolution, tree, breadcrumbs, recent feed), oracle-parity contract, computePathHash | `apps/api/src/docs/`, `apps/web/app/docs/` |
| [features/web-shell.md](features/web-shell.md) | layout/branding, route map, protected-route session handling, landing page, API path targeting | `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, `apps/web/next.config.mjs`, new web routes |

## Development docs — cross-cutting engineering contracts

| Doc | Scope | Read when |
|---|---|---|
| [development/workspace.md](development/workspace.md) | monorepo layout, shared toolchain, root/app commands | onboarding, adding workspaces/scripts/config |
| [development/api-conventions.md](development/api-conventions.md) | `/api` prefix, error envelope, logging/correlation, health contract, env validation pattern, DB/migration conventions | adding/changing any API module, migration, or env variable |
| [development/testing.md](development/testing.md) | every test/validation command, incl. single-test runs and the opt-in DB integration spec | writing or running tests |
| [development/agent-retrospective-patterns.md](development/agent-retrospective-patterns.md) | recurring failure patterns from past review cycles, with per-role prevention checklists | planning a feature, writing implementer prompts, or starting any agent role's subtask work |

## Operations docs — running and deploying

| Doc | Scope | Read when |
|---|---|---|
| [operations/launch.md](operations/launch.md) | env files + **the canonical env-variable contract**, hybrid & full-stack local modes, migrations, runtime URLs | starting the system locally, adding env vars |
| [operations/deployment.md](operations/deployment.md) | production topology, deploy runbook, post-deploy validation, rollback, forward-fix schema policy | deploying or changing production topology |

## Guides, architecture, and the rest

| Doc | Scope |
|---|---|
| [guides/content-management.md](guides/content-management.md) | admin/member how-tos: publish posts, comments/moderation, pages, navigation, wiki pages |
| [architecture/](architecture/) | locked architecture/deployment decisions (per milestone) — inputs to implementation, not to be reopened casually |
| [deferred-tasks.md](deferred-tasks.md) | deferred work register — planners read and append during planning cycles only |
| `cicd/docs/cicd.md` | CI/CD validation runner, config contracts, GitHub workflow shims (lives next to the scripts) |
| `cicd/tests/README.md` | CI/CD contract-test coverage |
| `apps/api/README.md` / `apps/web/README.md` | thin per-app runtime contracts linking back to these docs |
| `star_frontiers_rpg_website_design.md` (repo root) | the full product design (development document); as features ship, the docs above describe the implemented truth |

## Writing documentation

- One fact, one home. New behavior goes in the owning feature doc; cross-link with relative
  links instead of restating (especially security invariants and the env contract).
- New subsystem → new `features/<name>.md` + a row in the table above.
- New env variable → the table in [operations/launch.md](operations/launch.md) plus
  validation in `apps/api/src/config/environment.ts`.
- Docs describe the current state of the system — no milestone/subtask history (that lives
  in `plans/` and `artifacts/`).
- Verify claims against the code before writing them; do not document planned behavior.
