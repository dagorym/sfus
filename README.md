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
