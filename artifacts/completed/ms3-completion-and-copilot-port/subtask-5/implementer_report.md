# Implementer Report — MS3 Standalone Page Behavior Completion (Subtask 5)

## Status

SUCCESS

## Branch

`ms3-claude-implementer-subtask-5-20260604`

## Implementation Commit

`2a470b6`

## Task Summary

Completed Milestone 3 standalone-page behavior:

1. **Top-level route catch-all**: Created `apps/web/app/[slug]/page.tsx` — a dynamic Next.js App Router segment that serves published standalone pages at top-level paths (e.g., `/about`, `/rules`, `/contact`). Dynamic segments are evaluated by Next.js AFTER all static segments, so it never shadows any existing route.

2. **Reserved-slug enforcement**: Added `RESERVED_PAGE_SLUGS` constant to `pages.service.ts` and enforced it in `assertSlugValid()`. Both `create` and `update` paths reject reserved slugs (admin, api, app, blog, login, register, onboarding, profile, settings, health) with a 400 error. The catch-all route also blocks these at routing time for defense-in-depth.

3. **Revision metadata enrichment**: Updated `CreatePageInput` and `UpdatePageInput` to include `summary`, `changeNote`, and `featuredMediaId`. The `update` and `restoreRevision` methods now capture `editorUserId`. The `restoreRevision` method auto-sets `changeNote` to describe the source revision.

4. **Server-side sanitization**: `create`, `update`, and `restoreRevision` now call `validateMarkdownBody` (rejects unsafe content) and `normalizeMarkdownBody` (normalizes line endings). Restore passes through normalization on already-stored content.

5. **Efficient body resolution**: Added `findRevisionById(revisionId)` to `PagesService`. Replaced the full-scan `resolveCurrentBody` in the controller (which fetched all revisions and filtered in memory) with a direct `findRevisionById` lookup. Also added `resolveCurrentRevision` helper to populate `summary` and `featuredMediaId` in API responses.

6. **ImageUpload wired**: Both admin pages (`new/page.tsx` and `[id]/edit/page.tsx`) import and render `ImageUpload` with `resourceType="standalone-page"`. The featured image id is tracked in state and submitted with create/update requests. The edit form also shows a remove button.

7. **Featured image rendered publicly**: Both `app/pages/[slug]/page.tsx` and `app/[slug]/page.tsx` render the featured image using the media endpoint (`/api/media/:id`) when `featuredMediaId` is set.

8. **API response shapes updated**: `PageDetail` now includes `summary` and `featuredMediaId`. `RevisionDetail` now includes `editorUserId`, `summary`, `changeNote`, and `featuredMediaId`. Frontend `pages-client.ts` interfaces updated to match.

## Changed Files

- `apps/api/src/pages/pages.service.ts` — reserved slugs, sanitization, enriched revision creation, `findRevisionById`
- `apps/api/src/pages/pages.controller.ts` — efficient body resolution, enriched `PageDetail`/`RevisionDetail`, updated input parsers
- `apps/web/app/pages/pages-client.ts` — updated TypeScript interfaces for new fields
- `apps/web/app/pages/[slug]/page.tsx` — featured image rendering
- `apps/web/app/admin/pages/new/page.tsx` — `ImageUpload`, summary, featuredMediaId state and form fields
- `apps/web/app/admin/pages/[id]/edit/page.tsx` — `ImageUpload`, summary, changeNote, featuredMediaId state and form fields
- `apps/web/app/[slug]/page.tsx` — NEW: top-level catch-all with reserved-slug guard and featured image

## Validation Results

- `npx --yes pnpm@10.0.0 lint` — PASS
- `npx --yes pnpm@10.0.0 --filter @sfus/web exec vitest run` — PASS (129/129 tests)
- `npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run src/pages/ src/media/markdown-sanitizer.test.ts src/auth/ src/blog/ src/navigation/` — PASS (163/163 tests)
- `npx --yes pnpm@10.0.0 test` (full suite) — 206/206 tests pass; `src/media/media.controller.test.ts` fails due to a pre-existing missing `multer` package dependency (not caused by these changes, confirmed by checking the error existed before this subtask's commits)

## Pre-Existing Validation Failure

`src/media/media.controller.test.ts` fails with `Cannot find package 'multer'`. This is a pre-existing dependency resolution issue unrelated to this subtask. The file was not modified. The typecheck surface also shows this pre-existing error.

## Acceptance Criteria Status

- AC1: Published standalone pages render at top-level paths; catch-all is evaluated last; reserved slugs are rejected at create/edit ✓
- AC2: Only published pages are public; draft/unpublished revisions remain protected ✓
- AC3: Every edit creates a durable revision capturing summary, change note, editor user, and featured media; restore creates a new revision ✓
- AC4: Page bodies are sanitized/normalized server-side; featured media uploads via ImageUpload and renders publicly; current-body resolution no longer scans the full revision list ✓
- AC5: No block-builder or wiki behavior introduced ✓
