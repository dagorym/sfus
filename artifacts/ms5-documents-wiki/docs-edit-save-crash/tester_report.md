# Tester Report: docs-edit-save-crash

## Status: PASS

**Task:** docs-edit-save-crash  
**Branch:** ms5-docsedit-tester-20260613  
**Test Commit:** 6fbaf6c  

---

## Testing Scope

Validate the fix for the TypeError crash in the docs edit and history pages: after a successful write (`addDocRevision`, `renameDocPage`, `rollbackDocPage`), the client was storing a partial `DocWriteResultShape` into page state typed as `DocsPageShape`, causing a crash when render code accessed `page.lock.isLocked` (undefined on the partial shape). The fix adds `DocWriteResultShape`, retypes the write helpers, and updates both pages to re-fetch the full page via `getDocPageByPath` after every write.

**Implementation surface:**
- `apps/web/app/docs/docs-client.ts`
- `apps/web/app/docs/edit/[...path]/page.tsx`
- `apps/web/app/docs/history/[...path]/page.tsx`

**Test files modified:**
- `apps/web/app/docs/docs-client.spec.ts` (+61 tests, 633→94 total)
- `apps/web/app/docs/docs-edit-page.spec.ts` (+11 tests, 56→67 total)
- `apps/web/app/docs/docs-history-page.spec.ts` (+7 tests, 45→52 total)

---

## Acceptance Criteria Results

| AC | Description | Result |
|----|-------------|--------|
| AC1 (e) | DocWriteResultShape exported with correct fields; NOT lock/currentRevision/breadcrumbs/visibility | PASS |
| AC2 (f) | addDocRevision, renameDocPage, rollbackDocPage, createDocPage typed to return DocWriteResultShape | PASS |
| AC3 (a) | edit handleSubmit re-fetches via getDocPageByPath; setPage called with full DocsPageShape | PASS |
| AC4 | activeForeignLock and render-side lock access use optional chaining (null-safe) | PASS |
| AC5 (b/c) | router.replace on path change; non-fatal error on re-fetch failure; saveSuccess set accurately | PASS |
| AC6 (d) | history handleRollback re-fetches via getDocPageByPath before setPage | PASS |
| AC7 | lint clean, typecheck clean, 2287 tests pass, next build clean | PASS |

---

## Tests Added

### docs-client.spec.ts — DocWriteResultShape interface (AC1/e)
- Exports DocWriteResultShape as an interface
- Includes all required fields: id, title, path, depth, parentId, currentRevisionId, revisionNumber, createdAt, updatedAt
- Does NOT include: lock, currentRevision, breadcrumbs, visibility

### docs-client.spec.ts — Write helpers return DocWriteResultShape (AC2/f)
- addDocRevision, renameDocPage, rollbackDocPage, createDocPage all declare `Promise<DocWriteResultShape>`
- Behavioral verification: addDocRevision returns data.page (DocWriteResultShape, not DocsPageShape)

### docs-edit-page.spec.ts — Post-save re-fetch contract (AC3/AC5/a, crash regression)
- handleSubmit calls getDocPageByPath after addDocRevision (not setPage with partial write result)
- Uses finalPath (from write result) to call getDocPageByPath
- setPage called with result of getDocPageByPath (full DocsPageShape), not write result
- Form fields re-baselined from refreshed page after save
- saveSuccess set even when re-fetch fails (non-fatal path)
- Non-fatal error message surfaced on re-fetch failure

### docs-edit-page.spec.ts — Rename-then-save: path-change (AC5/b)
- finalPath computed from addDocRevision write result
- router.replace called with new edit URL when path changes
- useRouter from next/navigation used for replace call

### docs-edit-page.spec.ts — Null-safe lock access (AC4)
- activeForeignLock uses p.lock?.isLocked and p.lock?.lockExpiresAt
- Render-side uses page.lock?.lockExpiresAt

### docs-history-page.spec.ts — Rollback re-fetches full page (AC6/d)
- handleRollback calls getDocPageByPath after rollbackDocPage
- Passes writeResult.path (finalPath) to getDocPageByPath
- setPage called with refreshed (full page), not writeResult
- getDocPageByPath imported for rollback re-fetch
- rollbackDocPage called with page.id and revisionNumber
- writeResult variable holds DocWriteResultShape, not cast to DocsPageShape
- History reloaded (getDocHistory) after page re-fetch

---

## Commands Run

```
pnpm install --dir /home/tstephen/repos/worktrees/ms5-docsedit-tester-20260613
pnpm --filter @sfus/web --dir /home/tstephen/repos/worktrees/ms5-docsedit-tester-20260613 run test (baseline: 2250 passed)
pnpm --filter @sfus/web --dir /home/tstephen/repos/worktrees/ms5-docsedit-tester-20260613 run test (after new tests: 2287 passed)
pnpm --filter @sfus/web --dir /home/tstephen/repos/worktrees/ms5-docsedit-tester-20260613 run lint
pnpm --filter @sfus/web --dir /home/tstephen/repos/worktrees/ms5-docsedit-tester-20260613 run typecheck
pnpm --filter @sfus/web --dir /home/tstephen/repos/worktrees/ms5-docsedit-tester-20260613 run build
```

---

## Test Results Summary

- **Before:** 2250 tests passed / 30 skipped (61 test files)
- **After:** 2287 tests passed / 30 skipped (61 test files, +37 new tests)
- **Regressions:** 0
- **Lint:** PASS (0 warnings)
- **Typecheck:** PASS (0 errors)
- **Build:** PASS (next build clean)

---

## Temporary Byproducts

The `next build` run created `.next/` in the main sfus repo working directory (not in the worktree). These files are untracked in the main repo and are standard build artifacts; no cleanup required in the worktree.

---

## Cleanup Status

No temporary non-handoff byproducts left in the worktree. Only the three modified spec files are committed.
