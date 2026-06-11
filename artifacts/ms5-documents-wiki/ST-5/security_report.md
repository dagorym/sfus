Security Review Report

Scope reviewed:
- MS5 ST-5: Documents revision history, side-by-side diff, and rollback.
- Product code: apps/api/src/docs/docs.service.ts (getPageHistory, getRevisionByNumber, getDiff, static computeLineDiff, rollbackPage, toRevisionMetaShape); apps/api/src/docs/docs.controller.ts (GET :id/history, GET :id/revisions/:revisionNumber, GET :id/diff, POST :id/rollback); apps/api/src/docs/docs.types.ts (new shapes).
- Tests: docs.service.test.ts, docs.controller.test.ts, docs.service.integration.test.ts. Docs: docs/features/documents.md.
- Compared branch ms5-st5-security-20260611 against coordination base ms5 (read-only review).

Why specialist review was triggered:
- Planner marked ST-5 'Security review: required'.
- Adds one new authenticated write path (rollback) and three new unauthenticated READ paths (history, single-revision, diff) whose visibility must match the ST-2 oracle and must not leak gated content or create an existence oracle (P12).
- Rollback is a destructive-class operation that must be non-destructive and transactional (P10) and gated at the single write trust boundary.

Acceptance criteria / plan reference:
- plans/ms5-documents-wiki-plan.md (ST-5 acceptance criteria); cross-cutting principles P10 (transactional atomicity) and P12 (oracle parity).
- Security focus items 1-5 supplied in the coordinator security task for ST-5.

Findings

BLOCKING
- None

WARNING
- apps/api/src/docs/docs.service.ts:845-957 - getDiff feeds full revision bodies into the O(m*n) LCS table in computeLineDiff with no body-size or line-count cap; the route is reachable by an unauthenticated reader of any PUBLIC page.
  docs_revision.body is MEDIUMTEXT (up to ~16 MB). computeLineDiff allocates dp[m+1][n+1] numbers where m and n are line counts of the two revision bodies. A page whose revisions contain many lines (e.g. a few hundred KB of single-character lines = ~hundreds of thousands of lines) yields a multi-hundred-billion-cell allocation that OOMs/CPU-stalls the API worker. Content creation is moderator/admin gated (mitigating), but the unauthenticated GET /api/docs/:id/diff trigger plus the unbounded allocation means a single large public page can be turned into an availability outage by any anonymous caller or crawler. Recommend bounding the diff (max body bytes / max line count, or an early size guard returning 400/413) and/or documenting the operational cap. Severity held at WARNING because exploitation requires staff to first plant the large body.

NOTE
- apps/api/src/docs/docs.service.integration.test.ts:504-571 - The rollback integration test drives the REAL service end-to-end and proves non-destructiveness (rev 1 and 2 preserved, rev 3 == rev 1 body, current_revision_id repointed), but there is no rollback-specific mid-transaction-failure proof; transactional atomicity for rollback is inferred from the createPage/renamePage SAVEPOINT proofs.
  rollbackPage uses the identical pageRepository.manager.transaction wrapper as createPage (which has a dedicated real-DB constraint-violation rollback proof at lines 224-304), so the P10 invariant is well supported by inference and the rollback non-destructive proof drives a real transaction. A dedicated mid-rollback failure case (e.g. forcing a duplicate revision_number) would make the 'no dangling current_revision_id / no orphaned revision' invariant explicit for this path. Non-blocking.
- docs/features/documents.md:diff section - The diff endpoint documentation does not mention any body-size/line-count limit or the O(m*n) cost characteristic.
  Operators and future implementers have no documented expectation about safe revision-body sizes for diffing. Pairing this with the WARNING above (a bound plus a documented cap) would close the gap. Non-blocking.

Test sufficiency assessment:
- STRONG for the security-critical properties. Oracle parity (P12) is proven for all three read paths: getPageHistory, getRevisionByNumber, and getDiff each return NotFoundException(PAGE_NOT_FOUND_MESSAGE) for nonexistent, deleted (status='deleted'), and non-readable (visibility='members'/'private') pages, with explicit identical-message assertions and no 403-vs-404 distinction (docs.service.test.ts 1557-1838; docs.controller.test.ts 837-1014).
- Rollback authorization is proven at the controller seam: 401 precedes 403 (resolveSession awaited first; UnauthorizedException test at 1124), assertDocWriteAccess is invoked with 'site' BEFORE rollbackPage (call-order assertion assertOrder<rollbackOrder at 1072-1089), and a 'user'/anonymous caller is denied (403 at 1091-1106). No inline role check exists in rollbackPage.
- Non-destructive + transactional rollback (P10) is proven: unit test confirms em.save (new revision) + em.update (pointer/title) inside the transaction; the integration test drives the real service and verifies revisions 1 and 2 are preserved and rev 3 equals rev 1 (504-571).
- Diff input validation is covered (positive-integer from/to, equal-value 400, missing-param 400) at both controller and service layers; computeLineDiff is proven pure and deterministic with fixed-input pinning.
- GAP: no DoS/large-body test for the diff path, and no dedicated mid-rollback transaction-failure proof (see NOTE).

Documentation / operational guidance assessment:
- docs/features/documents.md accurately documents all four ST-5 endpoints, the oracle-parity 404 contract for the three read paths, the 401-then-403 staff gate for rollback, and the transactional/non-destructive rollback semantics.
- GAP: no mention of a diff body-size/line-count limit or the O(m*n) cost (see DoS WARNING and related NOTE). Otherwise sufficient for safe operation.

Artifacts written:
- artifacts/ms5-documents-wiki/ST-5/security_report.md
- artifacts/ms5-documents-wiki/ST-5/security_result.json

Outcome:
- CONDITIONAL PASS
