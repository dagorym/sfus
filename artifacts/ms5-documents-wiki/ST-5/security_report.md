Security Review Report

Scope reviewed:
- MS5 ST-5 specialist RE-REVIEW after a Verifier-driven remediation pass. Prior review (history/verifier-1-warn/security_report.md) returned CONDITIONAL PASS: 0 blocking, 1 WARNING (unauthenticated diff DoS), 2 NOTES.
- Remediation surface re-reviewed read-only against coordination base ms5: apps/api/src/docs/docs.types.ts (new DOCS_DIFF_MAX_BODY_BYTES=512000, DOCS_DIFF_MAX_LINES=5000); apps/api/src/docs/docs.service.ts getDiff (DoS size guard) + computeLineDiff; apps/api/src/docs/docs.controller.ts GET :id/diff.
- Re-confirmed the unchanged ST-5 trust boundary: oracle parity on the three read paths (getPageHistory / getRevisionByNumber / getDiff), rollback authorization (assertDocWriteAccess, site scope), and non-destructive transactional rollback (rollbackPage).
- Tests: apps/api/src/docs/docs.service.test.ts (getDiff DoS-guard suite, lines 1893-1996), apps/api/src/docs/docs.controller.test.ts (over-cap 400 propagation, lines 1014-1042), apps/api/src/docs/docs.service.integration.test.ts (rollback non-destructive proof, lines 504-571). Docs: docs/features/documents.md.

Why specialist review was triggered:
- Planner marked ST-5 'Security review: required'. The remediation directly addresses the prior WARNING, so specialist sign-off is required to confirm the WARNING is closed and no regression was introduced.
- The diff endpoint (GET /api/docs/:id/diff) is an UNAUTHENTICATED public read path that allocates an O(m*n) LCS table over MEDIUMTEXT (~16 MB) revision bodies; without a cap this is an anonymous availability/DoS surface.
- Three unauthenticated read paths must preserve oracle parity (P12) and not leak gated content or create a 403-vs-404 existence oracle; rollback is a destructive-class operation that must be non-destructive, transactional (P10), and gated at the single write trust boundary.

Acceptance criteria / plan reference:
- plans/ms5-documents-wiki-plan.md (ST-5 acceptance criteria); cross-cutting principles P10 (transactional atomicity) and P12 (oracle parity).
- Coordinator re-review focus items 1-3 supplied for this security stage.
- Prior archived security report: artifacts/ms5-documents-wiki/ST-5/history/verifier-1-warn/security_report.md (CONDITIONAL PASS).

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/docs/docs.types.ts:49-52 - Cosmetic comment error: states the DP table is capped at '~25 billion cells' for 5000 x 5000, but 5000 x 5000 = 25,000,000 (25 million), an off-by-1000x mislabel.
  The chosen bound is actually correct and safe (~25M cells / numbers per worst-case synchronous diff); only the inline comment overstates the figure. No code or test impact. Cosmetic; resolve at next touch.
- apps/api/src/docs/docs.service.integration.test.ts:504-571 - Unchanged carryover NOTE: the rollback integration test proves end-to-end non-destructiveness against the real DB (revs 1 and 2 preserved, rev 3 body == rev 1, current_revision_id repointed) but there is still no rollback-specific mid-transaction-failure proof.
  rollbackPage uses the identical pageRepository.manager.transaction wrapper as createPage/renamePage, both of which have dedicated real-DB mid-failure SAVEPOINT-rollback proofs (224-304, 366-430), so P10 atomicity for rollback is well supported by inference. Non-blocking; a dedicated forced-duplicate-revision_number case would make the no-dangling-pointer invariant explicit for this path.

Test sufficiency assessment:
- WARNING CLOSED — strong. The DoS guard is proven directly: docs.service.test.ts:1893-1996 builds a REAL DocsService (only repositories mocked) and exercises the real getDiff: byte cap fired for an over-cap fromRev body (1898) AND toRev body (1906); line cap fired for over-cap fromRev (1934) AND toRev (1943); each exception message asserted to contain the violated limit (1913, 1950); at-cap bodies (exactly DOCS_DIFF_MAX_BODY_BYTES) on both sides resolve through to a real computeLineDiff result (1970, 1978); constants pinned to 512000 / 5000 (1989, 1993) proving named constants, not env vars.
- Guard ordering verified in product code (docs.service.ts:879-898): Buffer.byteLength byte cap on both bodies fires BEFORE body.split, then the line cap fires BEFORE computeLineDiff allocates the dp[m+1][n+1] table — so no unbounded allocation can occur on the unauthenticated path. The split itself is bounded because it runs only after the <=512KB byte cap passes.
- Controller propagation proven: docs.controller.test.ts:1014-1042 confirms both the over-cap byte and over-cap line BadRequestException(400) surface unchanged to the HTTP caller. The diff handler accepts only from/to revision numbers (no caller-supplied body or size param), so the cap cannot be bypassed by request shaping.
- Oracle parity (P12) unchanged and intact: getDiff, getRevisionByNumber, and getPageHistory all use the identical guard (!page || page.status !== 'published' || !isPagePubliclyReadable(page)) returning NotFoundException(PAGE_NOT_FOUND_MESSAGE). The new 400 cap is inserted AFTER the readability and revision-existence checks, so it is reachable only for already-public pages with both revisions present and therefore introduces no new gated-content leak or 403-vs-404 oracle.
- Rollback authorization unchanged: controller resolves session (401) BEFORE assertDocWriteAccess (403) BEFORE rollbackPage; non-destructive transactional rollback (rollbackPage inserts a new highest-numbered revision equal to the target and repoints current_revision_id inside a single transaction, deleting nothing) is unchanged from the prior PASS.
- GAP (non-blocking): no dedicated mid-rollback transaction-failure integration proof (see NOTE); rollback atomicity remains inferred from the shared transaction wrapper and the createPage/renamePage mid-failure proofs.

Documentation / operational guidance assessment:
- Prior diff-limit documentation NOTE is RESOLVED. docs/features/documents.md now documents the DoS size guard explicitly: the two constants and their values (DOCS_DIFF_MAX_BODY_BYTES = 512,000 bytes / 512 KB via Buffer.byteLength; DOCS_DIFF_MAX_LINES = 5,000 lines after body.split('\n')), the 400 BadRequestException with a message naming the violated limit, the O(m x n) cost rationale, and the fact that the guard protects an unauthenticated public endpoint (lines 375-383).
- The diff endpoint response table adds the over-cap 400 case (line 413), and a constants/limits table documents both caps and their exceeded -> 400 behavior (lines 461-463).
- Documentation is sufficient for safe operation; operators and future implementers now have a documented expectation of safe revision-body sizes for diffing.

Artifacts written:
- artifacts/ms5-documents-wiki/ST-5/security_report.md
- artifacts/ms5-documents-wiki/ST-5/security_result.json

Outcome:
- PASS
