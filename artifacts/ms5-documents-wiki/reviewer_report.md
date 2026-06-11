# Reviewer Report — Milestone 5 (Documents Wiki)

Final, plan-level, read-only feature review.

## Feature plan reviewed

- `plans/ms5-documents-wiki-plan.md` — the approved Milestone 5 plan (ST-1 … ST-12,
  dependency ordering, per-subtask acceptance criteria, resolved design decisions,
  Documentation Impact, Risks / P-items).

## Review surface and inputs reviewed

- Full Milestone 5 diff: merge-base `git merge-base main ms5`
  (`6ad5ae56f6b7ee3db430e8adb78c1915968a6e25`) → `ms5`
  (296 files; +25,488 / −87).
- Delivered code read directly (not via verdict labels):
  - API: `apps/api/src/docs/docs.service.ts`, `docs.controller.ts`, `docs.types.ts`,
    `entities/docs-page.entity.ts`, `entities/docs-revision.entity.ts`,
    migration `1781308800000-milestone-five-documents-foundation.ts`,
    `docs.module.ts`; `database.config.ts` / `database.config.test.ts` registration;
    `config/environment.ts` (`DOCS_LOCK_TTL_MINUTES`);
    `common/filters/json-exception.filter.ts` (`error.details` passthrough);
    `forums/forums.service.ts` + `forums.types.ts` (ST-11).
  - Web: `apps/web/app/docs/**` (browse/render, authoring, history/diff/rollback,
    `docs-client.ts`), `apps/web/app/admin/page.tsx` (Documents link),
    `apps/web/app/page.tsx` + `apps/web/components/recent-doc-activity.tsx` (landing).
  - Docs: `documents.md`, `web-shell.md`, `authorization.md`, `forums.md`,
    `api-conventions.md`, `testing.md`, `launch.md`, `content-management.md`, `README.md`.
- Per-subtask coordination artifacts under `artifacts/ms5-documents-wiki/<ST-id>/`
  (implementer, tester, documenter, verifier; specialist security for ST-2/3/4/5;
  `ST-9-followup/`). Superseded passes under each `history/`.

## Overall feature completeness

The milestone is **functionally complete against the plan**. Every ST-1 … ST-12
acceptance criterion maps to delivered behavior, plus the coordinator-initiated
ST-9-followup defect fix. All 13 subtask verifier verdicts are PASS with 0 blocking
findings. The four security-marked subtasks (ST-2/3/4/5) carry specialist Security
artifacts that each reached a final **PASS** (0 blocking, 0 warning).

Confirmed independently from the code, not from verdict labels:

- **Schema / foundation (ST-1):** Both entities registered in `reviewedEntityClasses`;
  migration imported into `reviewedMigrationClasses` and named in the
  `reviewedMigrationNames` test expectation. Migration is MySQL 5.7.44 + utf8mb4
  compatible, uses `path_hash char(64)` uniqueness per `(scope_type, scope_id)` (not a
  long `path` unique index), creates all specified indexes/FKs, and breaks the circular
  `current_revision_id` FK by adding it after `docs_revisions` (forward-only down path).
- **Read API + oracle parity (ST-2):** All visibility routed through
  `AuthorizationService.evaluate()` via `isPagePubliclyReadable`; project-scoped pages
  excluded from every site index; nonexistent / deleted / non-readable all return the
  single `PAGE_NOT_FOUND_MESSAGE` 404. Breadcrumb chain truncates on the first gated
  ancestor (the remediated ST-2 finding) — verified in code (`break` then `reverse`) and
  by the security re-review.
- **Write API + authz seam (ST-3):** `assertDocWriteAccess` is the single gate; every
  write controller path calls it before the service write, after `resolveSession`
  (401-before-403). Create and edit are wrapped in `repository.manager.transaction`
  (P10); the mid-sequence-failure atomicity proof is now a real DB-gated integration
  test (the remediated ST-3 item). Slug/title/parent/collision validation present.
- **Tree management (ST-4):** Slug-change rewrites this page + all descendants' path /
  path_hash in one transaction; title-only rename leaves paths untouched; soft-delete
  sets `status='deleted'` (revisions preserved) and is blocked with 409 when non-deleted
  children exist. `resolveParent` rejects soft-deleted parents on both the `parentId` and
  `parentPath` branches (ST-3 carry-forward fix). Cross-parent move correctly omitted
  (deferred).
- **History / diff / rollback (ST-5):** Deterministic LCS line diff (`computeLineDiff`,
  pinned in tests); rollback creates a new highest-numbered revision equal to the target
  (non-destructive) inside a transaction; history/single-revision/diff reads reuse the
  same 404 parity gate. The diff DoS cap (`DOCS_DIFF_MAX_BODY_BYTES` 512 KB /
  `DOCS_DIFF_MAX_LINES` 5,000) fires before the O(m·n) table allocates on the
  unauthenticated path (the remediated ST-5 item).
- **Soft lock (ST-6):** Acquire/refresh/release with TTL expiry, holder metadata in 409,
  staff override; `assertNotForeignLocked` is wired into edit/rename/delete/rollback;
  expired locks treated as free; `DOCS_LOCK_TTL_MINUTES` validated at startup
  (1–1440, default 30) and lock state surfaced on reads.
- **Web (ST-7/8/9):** `/docs` browse/render with breadcrumbs and shared `MarkdownRenderer`;
  staff-gated authoring (create/edit/rename + lock UX) reusing `MarkdownEditor`;
  history + side-by-side diff + staff-gated rollback. `docs-client.ts` exposes all
  endpoints through the shared error-envelope pattern.
- **Admin link (ST-10):** Documents card added to `adminSections` → `/docs`.
- **Forums cleanup (ST-11):** `lastPost` now derives from the latest non-deleted reply's
  `createdAt` (`activity.at`), applied at both call sites (`listPublicCategories`,
  `getBoard`); the formerly always-null `TopicLastActivity.at` is now populated, with
  JSDoc tightened on `BoardLastPostShape` and `TopicLastActivity`. P7 breadth satisfied.
- **Landing (ST-12):** Hero / highlights / what's-new / explore / scope copy moved from
  Milestone 4 to Milestone 5; `/docs` link + wiki highlight added; `RecentDocActivity`
  added (with loading/empty/error states) consuming `GET /api/docs/recent`. No stale
  "Milestone 4" labels remain in `page.tsx`.

Cross-subtask integration is consistent: the web `docs-client` and `RecentDocActivity`
consume the ST-2/3/4/5/6 endpoints; the admin dashboard and landing both route to the
same `/docs` surface; the `error.details` passthrough in the JSON exception filter
carries the lock-conflict holder metadata to the web lock UX. Trust-boundary enforcement
is uniform: one `assertDocWriteAccess` seam, oracle-parity 404s shared across all read
paths, breadcrumb chain truncation, and the diff size cap.

Documentation coverage matches the plan's Documentation Impact section: new
`documents.md` (read/write/authz, oracle parity, revisions/diff/rollback, soft-lock,
DoS caps); `launch.md` env-var row; `authorization.md` gate cross-link;
`api-conventions.md` migration registry entry; `README.md` routing row;
`content-management.md` staff how-to; `web-shell.md` landing/admin route updates;
`testing.md` `SFUS_DB_INTEGRATION` opt-in; `forums.md` last-activity note.

## Findings

### BLOCKING
- None.

### WARNING
- None. (No finding rises to a level that should gate the merge of the milestone.)

### NOTE

1. **Stale global shell milestone label (out-of-plan-scope; actionable follow-up).**
   `apps/web/app/layout.tsx` still renders Milestone 4 copy in three places — the brand
   eyebrow `"Milestone 4 Content Platform"` (line 29), the metadata description
   (line 14), and the footer `"Built for the Milestone 4 content launch baseline."`
   (line 46). `docs/features/web-shell.md` documents the shared shell as
   `"Milestone 3 Content Platform"` (lines 13–17) — stale by two milestones. ST-12 was
   correctly scoped to `page.tsx` only; the global layout shell was outside every
   subtask's plan-defined allowed files, so the Coordinator correctly did not auto-fix
   it. This is a real, user-visible milestone-staleness gap. A Planner-ready follow-up is
   emitted below. Severity is NOTE (cosmetic copy, no behavioral/security impact).

2. **`authorization.md` gate table lists only the two create/edit write routes.**
   `docs/features/authorization.md` line 53 shows `assertDocWriteAccess` covering
   `POST /api/docs` and `POST /api/docs/:id/revisions`, but the same gate also guards
   `PATCH /api/docs/:id`, `DELETE /api/docs/:id`, `POST /api/docs/:id/rollback`, and the
   lock acquire/release routes. The statement is not wrong, just incomplete. Minor
   doc-accuracy top-up for a future docs touch; not milestone-gating.

3. **`DocsTreeItem.hasChildren` is hardcoded `false`.** `toTreeItem` always sets
   `hasChildren: false` (service line ~349) with a "populated by caller when needed"
   comment; no caller populates it. No plan AC requires it and the tree still renders via
   per-level fetches, so this is a latent/cosmetic field only. Candidate cleanup for the
   next docs-UX pass.

4. **Informational, carried from subtask reviews (verified, non-blocking):**
   - Docs integration suites (`docs.service.integration.test.ts`) are DB-gated behind
     `SFUS_DB_INTEGRATION=1` and skip cleanly without a DB — an execution-environment
     limitation, documented in `testing.md`.
   - The rollback mid-transaction-failure proof is inferred from the shared transaction
     wrapper plus the create/rename mid-failure integration proofs; there is no dedicated
     rollback-failure integration test (ST-5 NOTE).
   - `DocsPageShape.parentId` exposes the immediate parent's opaque UUID even when that
     parent is gated out of the breadcrumb chain. No public id-based page lookup exists,
     so this is not an actionable existence oracle (ST-2 NOTE).
   - Cross-parent doc move / reparent is intentionally deferred per the plan and recorded
     in `docs/deferred-tasks.md`.
   - In the write controllers, `assertDocWriteAccess` is called with the literal `"site"`
     scope rather than the loaded page's scope. This is correct for Milestone 5 (no
     project docs exist) and documented as such; it becomes relevant only when project
     scope lands (Milestone 5.5 / 7–8), where the seam is already shaped to branch.

## Follow-up feature requests for planning

1. **Refresh the global web-shell to Milestone 5.** Update `apps/web/app/layout.tsx` so
   the brand eyebrow, `metadata.description`, and footer no longer reference
   "Milestone 4" (e.g. eyebrow → "Milestone 5 Content Platform" or a
   milestone-agnostic label), and update the `docs/features/web-shell.md` "Shared shell"
   section (currently "Milestone 3 Content Platform", lines 13–17) to match. Scope: the
   global layout shell and its feature doc — distinct from ST-12, which only refreshed
   `page.tsx`. Acceptance: no stale "Milestone 3" or "Milestone 4" labels remain in
   `layout.tsx` or the web-shell shared-shell doc; `next build` and lint pass. Consider a
   milestone-agnostic shell label so future milestones do not require a layout edit each
   cycle.

2. **(Optional, low priority) Documentation top-up.** Extend the
   `docs/features/authorization.md` `assertDocWriteAccess` row to enumerate all gated
   write routes (rename, delete, rollback, lock acquire/release), not only create/edit.

## Final outcome

**CONDITIONAL PASS.**

Milestone 5 (Documents Wiki) is feature-complete and correct against
`plans/ms5-documents-wiki-plan.md`, with all 12 subtasks plus the ST-9-followup delivered,
all security obligations discharged to final PASS, and full documentation coverage. No
blocking or warning findings. The condition is the single actionable, out-of-plan-scope
NOTE-level gap — the stale global shell / web-shell-doc milestone label — which is handed
off to the Planner as follow-up request #1 rather than gating the milestone. The remaining
NOTEs are minor/informational.
