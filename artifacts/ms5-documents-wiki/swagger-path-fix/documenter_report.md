# Documenter Report

## Story
swagger-path-fix — ADR amendment for Swagger path relocation (Milestone 1 → Milestone 5)

## Documentation Scope
Single amendment to `docs/architecture/milestone-1-foundation-decisions.md`.

The Milestone-1 ADR recorded Swagger/OpenAPI at `/api/docs`. In Milestone 5 the path was
relocated to `/api/swagger` to avoid a namespace collision with the Documents wiki API
(`/api/docs`). Because this file is a point-in-time architecture decision record, the original
line was kept intact and a short amendment sub-bullet was appended immediately below it,
matching the document's existing list style.

## Verification (P1 — confirmed before edit)
`apps/api/src/index.ts` line 87 confirms `SwaggerModule.setup("api/swagger", ...)` is the
live path. The ADR amendment matches the actual implementation.

## Files Changed
- `docs/architecture/milestone-1-foundation-decisions.md` — added amendment sub-bullet under
  the Milestone-1 Swagger path decision (Framework Baseline section, ~line 36).

## Files NOT Changed (already correct)
- `docs/operations/launch.md`
- `docs/development/api-conventions.md`
- `apps/api/README.md`
- `docs/features/documents.md`

## Documentation Commit
`5423470c2d6071e4e79b7c6aa10d89cbdb48bc64`

## Outcome
SUCCESS
