# Implementer Report

Status:
- success

Task summary:
- ST-5: Implements revision history (GET /api/docs/:id/history), single-revision fetch (GET /api/docs/:id/revisions/:revisionNumber), deterministic line-level diff (GET /api/docs/:id/diff?from=&to=), and non-destructive rollback (POST /api/docs/:id/rollback) for the Documents wiki.

Changed files:
- apps/api/src/docs/docs.service.ts
- apps/api/src/docs/docs.controller.ts
- apps/api/src/docs/docs.types.ts

Validation commands run:
- npx --yes pnpm@10.0.0 lint
- npx --yes pnpm@10.0.0 typecheck
- npx --yes pnpm@10.0.0 test
- npx --yes pnpm@10.0.0 --filter @sfus/api exec tsc -p tsconfig.json

Validation outcome:
- PASS — lint 0 warnings, typecheck 0 errors, 1149 tests passed (23 DB-gated skips), API tsc build clean

Implementation/code commit hash:
- 73a0598d2e062576d4d1242064fe63ceff1b3fa8

Artifacts written:
- artifacts/ms5-documents-wiki/ST-5/implementer_report.md
- artifacts/ms5-documents-wiki/ST-5/tester_prompt.txt
- artifacts/ms5-documents-wiki/ST-5/implementer_result.json

Implementation context:
- getPageHistory(pageId): loads page with isPagePubliclyReadable gate (oracle-parity 404 if not published or readable); finds all revisions for the page ordered by revisionNumber ASC with author/editorUser relations; maps each to DocsRevisionMetaShape via toRevisionMetaShape private helper.
- getRevisionByNumber(pageId, revisionNumber): same page visibility gate; findOne by (pageId, revisionNumber); NotFoundException(PAGE_NOT_FOUND_MESSAGE) if revision is missing.
- getDiff(pageId, fromRevNumber, toRevNumber): validates from/to are positive integers and not equal (BadRequestException); page visibility gate; parallel-loads both revisions (Promise.all); splits body on newline; calls static DocsService.computeLineDiff(fromLines, toLines).
- DocsService.computeLineDiff(fromLines, toLines): STATIC method — LCS DP table (m x n), backtrack to produce {type, line} ops, reverse to document order, merge adjacent same-type ops into DocsDiffHunk[]. No external deps; deterministic. Tester calls DocsService.computeLineDiff([...],[...]) directly with fixed string arrays to pin expected output.
- rollbackPage(actorUserId, pageId, input): validateRevisionNumber (positive integer); transaction: load page (404 if missing/deleted); load target revision by revisionNumber (404 if missing); find highest existing revisionNumber; insert new revision with target body/title, editorUserId=actorUserId, summary=Rolled back to revision N; update page current_revision_id+title; return DocWriteResultShape.
- Oracle parity: getPageHistory, getRevisionByNumber, and getDiff all throw NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE) for non-readable/deleted/nonexistent pages — identical to ST-2 read errors.
- assertDocWriteAccess called by controller BEFORE rollbackPage; no inline role check inside service.
- Route ordering: GET :id/history, GET :id/revisions/:revisionNumber, GET :id/diff, POST :id/rollback all declared BEFORE the GET *path catch-all in the controller to prevent route shadowing.
- POST :id/rollback uses ThrottleGuard + THROTTLE_LABEL_DOC_EDIT (consistent with other write routes).
- New types in docs.types.ts: DocsRevisionMetaShape, DocsHistoryShape, DocsSingleRevisionShape, DocsDiffHunk, DocsDiffShape, DocRollbackInput.

Expected validation failures carried forward:
- None
