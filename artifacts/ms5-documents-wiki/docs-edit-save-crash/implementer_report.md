# Implementer Report

Status:
- SUCCESS

Task summary:
- Fix edit-page and rollback-page crash: after a successful write (addDocRevision, renameDocPage, rollbackDocPage) the client was storing the partial DocWriteResultShape into page state typed as DocsPageShape, causing a TypeError crash when render code accessed page.lock.isLocked (undefined on the partial shape). Fix: add DocWriteResultShape to docs-client, retype the three write helpers (and createDocPage) to return it, and update the edit and history pages to re-fetch the full page via getDocPageByPath after every write instead of calling setPage with the partial.

Changed files:
- apps/web/app/docs/docs-client.ts
- apps/web/app/docs/edit/[...path]/page.tsx
- apps/web/app/docs/history/[...path]/page.tsx

Validation commands run:
- npx --yes pnpm@10.0.0 --dir <worktree-root> --filter @sfus/web run lint
- npx --yes pnpm@10.0.0 --dir <worktree-root> --filter @sfus/web run typecheck
- npx --yes pnpm@10.0.0 --dir <worktree-root> --filter @sfus/web run test
- npx --yes pnpm@10.0.0 --dir <worktree-root> --filter @sfus/web run build

Validation outcome:
- PASS: lint clean, typecheck clean, 944/944 tests pass (0 regressions), next build clean.

Implementation/code commit hash:
- cea1fb6

Artifacts written:
- artifacts/ms5-documents-wiki/docs-edit-save-crash/implementer_report.md
- artifacts/ms5-documents-wiki/docs-edit-save-crash/tester_prompt.txt
- artifacts/ms5-documents-wiki/docs-edit-save-crash/implementer_result.json

Implementation context:
- DocWriteResultShape is a lightweight interface: id, title, path, depth, parentId, currentRevisionId, revisionNumber, createdAt, updatedAt. It does NOT contain lock, currentRevision, breadcrumbs, or visibility.
- The API write contract is CORRECT and must NOT change; only the web-client type assumptions and post-write state handling changed.
- addDocRevision / renameDocPage / rollbackDocPage now declare Promise<DocWriteResultShape>. Their internal JSON casts use AddDocRevisionResult / { page: DocWriteResultShape } respectively.
- edit page handleSubmit: renames first (stores write result path), then addDocRevision (stores write result path), then calls getDocPageByPath(finalPath). On success: setPage(refreshed), re-baseline all form fields, router.replace if path changed. On re-fetch failure: setError(non-fatal message), setSaveSuccess(true) since the write succeeded.
- history page handleRollback: calls rollbackDocPage (returns DocWriteResultShape), then getDocPageByPath(writeResult.path) and setPage(refreshed); reloads history as before.
- activeForeignLock guard changed from p.lock.isLocked to p.lock?.isLocked (and lockExpiresAt); same null-safe change applied to render-side page.lock?.lockExpiresAt in the lock banner.
- The CREATE flow (new/page.tsx) is NOT changed and was not affected; it only reads .path which exists on DocWriteResultShape.
- All 944 existing tests pass because the existing test suite uses source-analysis patterns; the Tester must add regression tests for the new re-fetch behavior (see tester handoff for required coverage).
- Validation run from worktree: install deps first with: npx --yes pnpm@10.0.0 --dir <worktree> install --frozen-lockfile

Expected validation failures carried forward:
- None
