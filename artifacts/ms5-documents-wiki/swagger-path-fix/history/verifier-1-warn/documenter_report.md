# Documenter Report

**Story:** Swagger-path-fix — move Swagger UI from `/api/docs` to `/api/swagger`
**Branch:** ms5-swaggerfix-documenter-20260612
**Documentation commit:** e1b4e3b

## Scope

The implementer relocated the Swagger UI mount from `/api/docs` to `/api/swagger` (and the
OpenAPI JSON document from `/api/docs/openapi.json` to `/api/swagger/openapi.json`) in
`apps/api/src/index.ts` to eliminate a route collision with the Milestone 5 Documents wiki
API namespace (`/api/docs/*`). Three documentation files referenced the old path and required
updating.

## Changes Made

### docs/operations/launch.md (line ~163)
- Updated the "Swagger (dev)" runtime URL from `http://localhost:3001/api/docs` to
  `http://localhost:3001/api/swagger`.

### docs/development/api-conventions.md (Routing & Swagger section, line ~34)
- Updated Swagger UI path from `/api/docs` to `/api/swagger`.
- Updated OpenAPI JSON path from `/api/docs/openapi.json` to `/api/swagger/openapi.json`.
- Added a one-sentence note explaining the mount was moved to avoid collision with the
  Documents wiki API namespace (`/api/docs/*`).

### apps/api/README.md (line ~10)
- Updated Swagger path from `/api/docs` to `/api/swagger`.
- Updated OpenAPI JSON path from `/api/docs/openapi.json` to `/api/swagger/openapi.json`.

## Files Not Changed

- `docs/features/documents.md` — the `/api/docs/*` Documents wiki API contract is correct and
  unchanged; this file was not touched.
- No code files were changed.

## Outcome

All three documentation files updated with minimal, localized edits. Documentation commit
`e1b4e3b` exists on branch `ms5-swaggerfix-documenter-20260612`.
