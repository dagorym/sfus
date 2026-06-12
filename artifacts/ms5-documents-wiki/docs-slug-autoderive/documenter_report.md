# Documenter Report: docs slug auto-derivation (docs-slug-autoderive)

## Task

Document the optional `slug` field with auto-derivation and collision-safe suffixing for
POST /api/docs in `docs/features/documents.md`.

## Documentation scope

Single owning file: `docs/features/documents.md`. The `docs/README.md` routing table
confirms this as the canonical doc for `apps/api/src/docs/`. No other doc file documents
the docs CREATE endpoint slug contract.

Cross-reference checked: `docs/guides/content-management.md` line 219 already correctly
states "Slug (optional — leave blank to let the server derive it from the title)" — no
change needed there.

## Changes made

**File: `docs/features/documents.md`** (commit `06f6b7d`)

1. POST /api/docs request-body table — `slug` row:
   - Changed `Required` column from `yes` to `no`.
   - Replaced the terse description `1-255 chars; [a-z0-9-] only` with a full optional-field
     description covering: character constraints (`[a-z0-9-]`, 1-255 chars when provided),
     auto-derivation algorithm (lowercase, non-alphanumeric runs replaced with single hyphen,
     leading/trailing hyphens stripped, fallback to `"page"` when no alphanumeric characters
     remain), collision-safe numeric suffixing (`-2`, `-3`, ...) checked inside the transaction,
     and the explicit-slug path (validated, returns 409 on collision).

2. POST /api/docs error-responses table — 400 row:
   - Changed "Invalid slug or title" to "Invalid **explicit** slug or title" to clarify the
     400 only fires for an explicit slug that fails the `validateSlug` validator.

3. POST /api/docs error-responses table — 409 row:
   - Updated to state "Explicit slug collision" and added a note that auto-derived slugs
     avoid 409 via numeric suffixing.

4. "Slug and title validation" prose section:
   - Added a sentence clarifying that `validateSlug` is called only when the caller supplies
     an explicit slug on create or rename; auto-derived slugs bypass the validator.

The PATCH /api/docs/:id rename contract was not touched — slug remains "one of slug/title
required" for rename operations.

## Reconciliation summary

No other docs file contained a stale statement that docs CREATE requires slug. The single
required update was in `docs/features/documents.md`.

## Commit

Documentation commit: `06f6b7d` — "docs(documents): document optional slug with auto-derivation for POST /api/docs"

## Result

PASS — documentation updated, no in-code comment requirements triggered, no new docs file
needed, PATCH rename contract unchanged.
