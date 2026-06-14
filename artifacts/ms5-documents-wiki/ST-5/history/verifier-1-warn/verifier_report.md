Verifier Report

Scope reviewed:
- MS5 ST-5: Documents revision history, single-revision fetch, line-level diff, and non-destructive rollback. Implementer commit 73a0598, Tester commit 26009f9, Documenter commit 80fe6ce. Files reviewed: apps/api/src/docs/docs.service.ts (getPageHistory, getRevisionByNumber, getDiff, static computeLineDiff, rollbackPage, toRevisionMetaShape), docs.controller.ts (4 new routes), docs.types.ts (new shapes), docs.service.test.ts, docs.controller.test.ts, docs.service.integration.test.ts, docs/features/documents.md. Specialist Security review already committed (CONDITIONAL PASS, 0 blocking, 1 WARNING, 2 NOTEs).

Acceptance criteria / plan reference:
- plans/ms5-documents-wiki-plan.md, ST-5 acceptance criteria (AC1-AC4).

Convention files considered:
- docs/development/api-conventions.md
- docs/development/testing.md
- docs/features/authorization.md
- docs/features/documents.md
- AGENTS.md

Findings

BLOCKING
- None

WARNING
- apps/api/src/docs/docs.service.ts:906-957 - computeLineDiff builds an O(m*n) LCS table over full revision bodies with no size or line-count cap; GET /api/docs/:id/diff is unauthenticated for any public page.
  docs_revision.body is MEDIUMTEXT (up to ~16 MB). The dp array is (m+1)*(n+1) numbers where m and n are line counts. A public page with large revision bodies (e.g. hundreds of thousands of single-character lines) could OOM or CPU-stall the API worker for an anonymous caller. Content creation is staff-gated (mitigating), but the unauthenticated GET trigger plus unbounded allocation creates an availability risk. The security specialist held this at WARNING (not BLOCKING) because exploitation requires prior staff write access. Verifier concurs: WARNING classification is appropriate. Recommended resolution: add a body-bytes or line-count cap with a 400/413 response before entering the DP loop, and document the operational cap in docs/features/documents.md.

NOTE
- apps/api/src/docs/docs.service.integration.test.ts:504-571 - No rollback-specific mid-transaction-failure integration proof; atomicity is inferred from shared transaction wrapper used by createPage and renamePage.
  rollbackPage uses the identical pageRepository.manager.transaction wrapper as createPage (which has a dedicated real-DB constraint-violation rollback proof). The integration test proves the happy-path non-destructive semantics with a real DB. A dedicated mid-rollback failure case (e.g. forcing a duplicate revision_number) would make the 'no dangling current_revision_id / no orphaned revision' invariant explicit for this path. Non-blocking; atomicity well-supported by inference.
- docs/features/documents.md:370-406 - The diff endpoint documentation does not mention any body-size/line-count limit or the O(m*n) cost characteristic of computeLineDiff.
  Operators and future implementers have no documented expectation about safe revision-body sizes for diffing. Adding a note about the operational cap (or the absence of one) pairs with the WARNING above. Non-blocking; documentation is otherwise accurate and complete.

Test sufficiency assessment:
- STRONG overall. computeLineDiff is directly unit-tested as a static method with pinned fixed-input assertions covering: identical content, add-line, remove-line, modify-line, empty-from, empty-to, both-empty, determinism (two calls, same input, same output), and multi-line merge correctness. These are exactly the determinism assertions called for by P3.
- getPageHistory: oracle parity (nonexistent, deleted, non-readable all produce identical PAGE_NOT_FOUND_MESSAGE) is explicitly asserted at the service layer with a Set-uniqueness check. Author/editor shape, empty-list, and field-level mapping are covered. Integration test proves ordering ASC and real-DB deleted-page 404.
- getRevisionByNumber: page-not-found, deleted-page, non-readable, missing-revision-number, full-body + author/editor shape coverage.
- getDiff: missing-param 400, invalid-integer from/to, equal-value 400, page-not-found/deleted/non-readable, missing fromRev/toRev 404 (both individually), and a positive hunk-content assertion at the service layer. Controller layer adds parameter-parsing and delegation tests.
- rollbackPage: new-revision-number-is-highest, summary='Rolled back to revision N', target body copied (non-destructive), em.save+em.update inside transaction (P10 structure), invalid-revisionNumber 400, page-not-found, deleted-page, target-revision-not-found. AC4 (assertDocWriteAccess before rollbackPage, 403 for user role, 401 for no session) is proven at the controller layer with invocation-call-order assertion.
- GAP (carried from security report): no DoS/large-body test for the diff path; no dedicated mid-rollback transaction-failure integration proof. Neither gap is blocking.

Documentation accuracy assessment:
- docs/features/documents.md accurately documents all four ST-5 endpoints: GET /:id/history, GET /:id/revisions/:revisionNumber, GET /:id/diff, POST /:id/rollback.
- Oracle-parity 404 contract for the three unauthenticated read paths is documented correctly.
- 401-then-403 gate order, assertDocWriteAccess routing, and ThrottleGuard label are documented correctly for rollback.
- Transactional/non-destructive rollback semantics (P10), new-revision-is-highest, and the 'Rolled back to revision N' summary are documented.
- Route ordering note explicitly lists all ST-5 routes as registered before GET *path.
- GAP: no mention of a diff body-size/line-count limit or the O(m*n) cost (see WARNING and NOTE). Otherwise complete and accurate.

Artifacts written:
- artifacts/ms5-documents-wiki/ST-5/verifier_report.md
- artifacts/ms5-documents-wiki/ST-5/verifier_result.json

Verdict:
- CONDITIONAL PASS
