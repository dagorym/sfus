---
name: "documentation-map"
description: "Discover and read only the documentation relevant to the current task via the docs/README.md routing table."
---

# Documentation Map

Use this skill when starting substantive work on any part of the system and the right documentation must be located before reading or writing code or docs.

## Shared Rules

- Before substantive work, open `docs/README.md` (the documentation routing table) and identify the rows whose scope or code paths match the task — typically 1–3 docs.
- Read only those matching docs in full; do not read the whole documentation tree.
- Do not rely on memory of the old monolithic `docs/README.md` or `docs/website-launch-guide.md` layout; those files were restructured or removed, and `cicd/docs/local-pipeline.md` no longer exists.
- When a doc's routing-table row no longer matches reality (file moved, renamed, or added), fix the routing table in `docs/README.md` in the same change.

## Common Routes

- Per-subsystem API/web contracts (auth, authorization, media, blog, pages, navigation, web-shell) → `docs/features/<name>.md`.
- Test or validation commands → `docs/development/testing.md`.
- Cross-cutting API conventions (error envelope, logging, health, env validation, migrations) → `docs/development/api-conventions.md`.
- Environment variables → `docs/operations/launch.md` (the single canonical env table).
- Local run, containers, migrations → `docs/operations/launch.md`.
- Production deploy and rollback → `docs/operations/deployment.md`.
- CI/CD runner and config contracts → `cicd/docs/cicd.md`.

## Documentation Writers

Roles that write documentation (especially the documenter) must follow the "Writing documentation" rules at the bottom of `docs/README.md`:

- One fact, one home: update the owning feature doc rather than duplicating.
- New subsystem → new `docs/features/<name>.md` plus a routing-table row.
- New env variable → the table in `docs/operations/launch.md` plus validation in `apps/api/src/config/environment.ts`.
- Docs describe current state only — no milestone or subtask history.
- Verify claims against code before writing.

## Limits

- Keep role-specific documentation duties and approval gates inline in the agent definition.
- Do not use this skill to justify skipping a doc whose routing-table row clearly matches the task.
