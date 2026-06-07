# Workspace & Toolchain

Monorepo layout, the shared toolchain, and the root/app command surfaces.

**Code:** root `package.json`, `pnpm-workspace.yaml`, `packages/config/`
**Related:** [testing](testing.md) for running tests · [launch](../operations/launch.md) for
running the app

## Layout

- `apps/web` — Next.js (App Router) frontend
- `apps/api` — NestJS API
- `packages/config` — shared TypeScript, ESLint, and Prettier configuration
- `cicd/` — Compose files, validation/build scripts, CI/CD config and contract tests
- `docs/` — documentation (see the [routing table](../README.md))
- `.myteam/`, `plans/`, `artifacts/` — agent workflow system, plans, and run artifacts

## Shared toolchain

- TypeScript strict mode, centralized in `packages/config/tsconfig.base.json`.
- ESLint (`packages/config/eslint.base.cjs`) and Prettier
  (`packages/config/prettier.base.cjs`) consumed by root and both apps.
- pnpm workspaces; no extra monorepo orchestrator (locked Milestone 1 decision — see
  `docs/architecture/milestone-1-foundation-decisions.md`).
- `pnpm` is not assumed globally installed; the repo-standard invocation is
  `npx --yes pnpm@10.0.0 <command>` (used by CI config too). `corepack enable` +
  `pnpm install --frozen-lockfile` is the setup path when working host-side.

## Root commands

| Command | Effect |
|---|---|
| `pnpm build` | recursive app builds (`tsc` for api, `next build` for web) |
| `pnpm lint` | recursive ESLint (`--max-warnings=0`) |
| `pnpm typecheck` | recursive `tsc --noEmit` |
| `pnpm test` | recursive Vitest suites |
| `pnpm format` / `pnpm format:check` | Prettier write/check across root, `apps/*`, `packages/*` |

## App workspace commands

Both apps expose `build`, `lint`, `typecheck`, `test`, `format`, `format:check`. In addition:

- `apps/api`: `start` (`node dist/index.js`), `migration:run`, `migration:show`,
  `test:integration` (see [testing](testing.md))
- `apps/web`: `dev`, `start`

Filter to one workspace with `npx --yes pnpm@10.0.0 --filter @sfus/api <script>` (or
`@sfus/web`).
