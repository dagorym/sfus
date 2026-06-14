# Documenter Report — ST-4 (Documents tree management)

## Outcome

PASS

## Documentation changes

**File:** `docs/features/documents.md`

Added the following content under the existing Write API section:

1. **`PATCH /api/docs/:id` — rename a page (slug and/or title)**
   - Slug-change behaviour: atomic subtree path rewrite (self + all descendants).
   - Title-only change: no path/path_hash touched.
   - Explicit note that cross-parent move/reparent is deferred.
   - Request body (`RenameDocPageInput`): `slug?`, `title?` (at least one required).
   - Response: `200 { page: DocWriteResultShape }`.
   - Error table: 400, 401, 403, 404, 409, 429.
   - Throttle label: `doc-page-edit`.

2. **`DELETE /api/docs/:id` — soft-delete a page**
   - Status set to `'deleted'`; revision rows preserved.
   - Deleted pages disappear from all public reads (oracle parity).
   - Children guard: `409 ConflictException` when any published child exists.
   - Response: `204 No Content`.
   - Error table: 401, 403, 404, 409, 429.
   - Throttle label: `doc-page-edit`.

3. **Parent resolution note** (new subsection)
   - Documents that `resolveParent` now filters `status='published'` on both
     `parentId` and `parentPath` branches, so soft-deleted parents are rejected
     with `400 BadRequestException`.

## Verification notes

All claims verified against:
- `apps/api/src/docs/docs.service.ts` — `renamePage`, `softDeletePage`, `resolveParent`
- `apps/api/src/docs/docs.controller.ts` — `PATCH :id`, `DELETE :id` routes
- `apps/api/src/docs/docs.types.ts` — `RenameDocPageInput` interface

## Documentation commit

`fed0ff0`

## Files modified

- `docs/features/documents.md`
