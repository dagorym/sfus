# SFUS Milestone 1 Foundation Bootstrap

This repository now includes the Milestone 1 foundation baseline for the monorepo, runtime contracts, and CI/CD scaffolding.

## Workspace Layout

- `apps/web` - frontend workspace baseline
- `apps/api` - backend workspace baseline
- `packages/config` - shared TypeScript, ESLint, and Prettier configuration

## Shared Toolchain Baseline

- TypeScript strict mode is centralized via `packages/config/tsconfig.base.json`.
- ESLint config is centralized in `packages/config/eslint.base.cjs` and consumed by root, `apps/web`, and `apps/api`.
- Prettier config is centralized in `packages/config/prettier.base.cjs` and consumed by root, `apps/web`, and `apps/api`.
- Root and app-level command surfaces run the actual toolchain (`tsc`, `eslint`, `vitest`, and `prettier`) rather than placeholder scripts.

## Root Commands

- `pnpm build` - recursively runs each app workspace build command.
- `pnpm lint` - recursively runs each app workspace ESLint command.
- `pnpm typecheck` - recursively runs each app workspace TypeScript no-emit check.
- `pnpm test` - recursively runs each app workspace `vitest` command.
- `pnpm format` - formats root workspace files plus `apps/*` and `packages/*`.
- `pnpm format:check` - checks formatting for the same workspace surfaces without writing changes.

## App Workspace Commands

- `apps/web` and `apps/api` each expose `build`, `lint`, `typecheck`, `test`, `format`, and `format:check`.
- Each app inherits shared TypeScript, ESLint, and Prettier settings from `packages/config` while executing its own local source-file commands.

## Runtime Contract Overview

Milestone 1 local development is hybrid by default:

- `web` runs on the host at `localhost:3000`
- `api` runs on the host at `localhost:3001`
- `mysql` runs through `cicd/docker/compose.dev.yml`

The same local Compose file also supports full-stack container validation with the `fullstack` profile, while `cicd/docker/compose.prod.yml` is the single production Compose definition for long-lived `web` and `api` services. Production routing stays behind the existing reverse-proxy integration, so production-oriented Compose does not bind host ports for either app service.

## Environment Ownership

Copy the example env files before running local Compose validation:

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
```

Ownership is split by runtime boundary:

- `.env.example` - platform/deployment-owned values used by Compose metadata and local MySQL scaffolding
- `apps/web/.env.example` - web-owned values, including `/api` path targeting and container-internal API routing
- `apps/api/.env.example` - API-owned values, including the database contract used by the API container and the explicit migration flow

The example files are templates only. Production secrets and the external production MySQL connection are managed on the host outside the repository checkout.

## Deployment And Validation References

- `cicd/docs/local-pipeline.md` - hybrid local development, full-stack Compose validation, and explicit production migration flow
- `cicd/docs/cicd.md` - CI/CD entrypoints, runtime contract artifacts, and production topology expectations
- `docs/architecture/milestone-1-foundation-decisions.md` - locked Milestone 1 architecture and deployment decisions
