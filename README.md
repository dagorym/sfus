# SFUS Milestone 1 Foundation Bootstrap

This repository now includes the Milestone 1 Subtask 1 monorepo baseline.

## Workspace Layout

- `apps/web` - frontend workspace baseline
- `apps/api` - backend workspace baseline
- `packages/config` - shared TypeScript, ESLint, and Prettier configuration

## Shared Toolchain Baseline

- TypeScript strict mode is centralized via `packages/config/tsconfig.base.json`.
- ESLint config is centralized in `packages/config/eslint.base.cjs` and consumed by root, `apps/web`, and `apps/api`.
- Prettier config is centralized in `packages/config/prettier.base.cjs` and consumed by root, `apps/web`, and `apps/api`.

## Root Commands

- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm format`
- `pnpm format:check`
