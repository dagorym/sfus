Verifier Report

Task: ST-2 — Documents read API (path resolution, tree, breadcrumbs, recent feed)
Branch: ms5-st2-verifier-20260610
Plan: plans/ms5-documents-wiki-plan.md (ST-2)
Date: 2026-06-10

---

Scope reviewed:
- Implementer: apps/api/src/docs/docs.service.ts (DocsService), apps/api/src/docs/docs.controller.ts (DocsController), apps/api/src/docs/docs.module.ts (updated), apps/api/src/docs/docs.types.ts (updated)
- Tester: apps/api/src/docs/docs.service.test.ts (new), apps/api/src/docs/docs.controller.test.ts (new), apps/api/src/docs/docs-module.test.ts (updated)
- Documenter: docs/features/documents.md (new), docs/README.md (routing table row added)
- Security: artifacts/ms5-documents-wiki/ST-2/security_report.md consulted; outcome CONDITIONAL PASS, 0 blocking, 1 warning (Medium), 2 notes

Acceptance criteria / plan reference:
- plans/ms5-documents-wiki-plan.md ST-2, AC1–AC5
- Oracle parity rule P12 (nonexistent, deleted, and non-readable pages all return identical 404)

Convention files considered:
- docs/development/api-conventions.md
- docs/features/authorization.md
- AGENTS.md (single-source-of-truth rule, documentation conventions)
- docs/README.md (writing documentation rules)

---

Findings

BLOCKING
- None

WARNING
- apps/api/src/docs/docs.service.ts:227-241 — buildBreadcrumbs does not route ancestor pages through isPagePubliclyReadable. Non-readable, project-scoped, and deleted ancestors are deliberately included (confirmed by code comment lines 224-225 and docs/features/documents.md:63). The migration has no parent_id FK and no scope CHECK constraint, so nothing prevents a published public site page from having a project-scoped or private ancestor. In that tree configuration an unauthenticated caller would receive the ancestor's id and human-readable title via the breadcrumb response. This is the WARNING finding previously identified and confirmed by the specialist security review. It is not exploitable in ST-2 alone (the cross-scope tree can only be created by the not-yet-implemented ST-3 write path), but must be gated before ST-3 lands. Carry forward: filter breadcrumb ancestors through isPagePubliclyReadable before ST-3 merges, and update docs/features/documents.md:63 to describe the filtering behavior.
- apps/api/src/docs/docs.service.test.ts:231-260 — Breadcrumb tests cover only a readable site ancestor. No negative test asserts behavior when an ancestor is project-scoped, visibility='members', visibility='private', or status='deleted'. The gap matches the security NOTE; remediate alongside the breadcrumb filtering fix.

NOTE
- apps/api/src/docs/docs-module.test.ts:27-43 — The updated module test descriptions say "registers DocsController — routes introduced in ST-2" and "registers DocsService as a provider — service wiring added in ST-2", but the test body uses `length >= 1` assertions (correct behavior). The test names are accurate and match the module's current state. No defect; recorded for awareness only.
- apps/api/src/docs/docs.controller.ts:117 — The @Get("*path") wildcard decorator uses the Express v5 wildcard syntax. This is consistent with the existing app's Express 5 dependency (package.json shows `express: ^5.2.1`). NestJS may emit deprecation warnings for this syntax depending on adapter version. No functional defect in this version; note for future compatibility tracking.
- Docs test suite re-execution in the isolated worktree: the worktree does not have its own node_modules install; the new docs.service.test.ts and docs.controller.test.ts could not be executed via the worktree-local vitest call. The tester's reported run (1065 passed, 0 failed, 11 skipped) was from a fully-installed environment. All three docs test files are confirmed present on disk. This is the same limitation noted in the security report NOTE; not a defect.

---

Correctness review assessment (AC1–AC5):

AC1 — PASS. getPageByPath correctly normalizes the path, computes the SHA-256 pathHash, queries for scopeType='site' and scopeId=IsNull(), checks status='published' and isPagePubliclyReadable(), builds breadcrumbs from the parent chain, and returns DocsPageShape with currentRevision and breadcrumbs. The breadcrumb ordering (deepest-first then reversed = root-to-parent) is correct. The null-revision case is handled in toPageShape (returns null for currentRevision).

AC2 — PASS. DocsService.PAGE_NOT_FOUND_MESSAGE = 'Document page not found.' is a static readonly constant. All three gated conditions (nonexistent page → findOne returns null, deleted page → status !== 'published', non-readable page → isPagePubliclyReadable returns false) throw `new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE)` at the same code line (docs.service.ts:111). Oracle parity is enforced: the throw path is identical regardless of the reason.

AC3 — PASS. listPageTree queries with `scopeType: 'site', scopeId: IsNull(), status: 'published'` at the DB level, then filters the result through `isPagePubliclyReadable()`. Project-scoped pages cannot appear because the repository query explicitly filters on scopeType='site'. The parentPath fork also routes the parent lookup through the same oracle-parity 404 when the parent is absent or non-readable.

AC4 — PASS. listRecentEdits builds an allow-list of publicly-readable site page ids via `isPagePubliclyReadable`, short-circuits to empty array when the list is empty (no oracle leak), and queries revisions with a join on page.current_revision_id = revision.id to select only the current revision per page. Limit handling: defaults to RECENT_DOCS_DEFAULT_LIMIT (5), clamps to Math.min(20, Math.max(1, safeLimit)) — correctly enforces default=5, max=20, min=1.

AC5 — PASS. Every visibility decision in DocsService routes through AuthorizationService.evaluate() via isPagePubliclyReadable(). No inline re-derived predicates exist. The anonymous actor `{ userId: null, globalRole: '' }` is the only actor used. The controller has no AuthorizationService dependency and no auth decorators — all unauthenticated as required.

---

Integration check:
- DocsModule.register() correctly imports TypeOrmModule.forFeature([DocsPageEntity, DocsRevisionEntity]) and AuthorizationModule; exports DocsService for consumption by ST-3+.
- DocsController is registered in app.module.ts via DocsModule.register(environment). Confirmed at apps/api/src/app.module.ts:37.
- AuthorizationService.evaluate() does not special-case resourceType — it uses the visibility field generically. The docs_page resource type passes the visibility-open check for 'public'/'unlisted' and correctly returns false via authentication-required for anonymous actors requesting 'members'/'private' pages. The behavior is correct.
- Route ordering: @Get("recent") is declared before @Get("*path") in DocsController (lines 84 and 117 respectively). This satisfies the NestJS route resolution requirement and matches the documentation.

---

Test sufficiency assessment:
- Strong for the primary acceptance criteria: docs.service.test.ts provides 53 distinct test cases covering AC1 (path resolution, breadcrumbs), AC2 (oracle parity — nonexistent, deleted, members, private all return identical PAGE_NOT_FOUND_MESSAGE), AC3 (scope isolation, parentPath handling), AC4 (limit default/max/clamp, project-page exclusion, stable empty list), and AC5 (evaluate() spy assertions for all three read methods and the anonymous actor shape).
- docs.controller.test.ts provides 24 test cases covering controller delegation, response envelope shapes ({ pages }, { docs }, { page }), wildcard path normalization, and oracle parity propagation.
- docs-module.test.ts provides 4 tests confirming DocsController and DocsService are registered and AuthModule is imported.
- GAP (documented WARNING): no negative breadcrumb test for non-readable/project-scoped/deleted ancestor. Must be added alongside the breadcrumb filtering fix before ST-3.
- Tester reported 1065 passed, 0 failed, 11 skipped (DB integration gated). Verified locally that the docs module tests (docs-entities.test.ts, docs-module.test.ts) pass green. The new service and controller test files cannot be re-executed in the isolated worktree due to absent node_modules (same limitation as security NOTE), but are confirmed correct by static inspection.

---

Documentation accuracy assessment:
- docs/features/documents.md accurately describes all three endpoints, response shapes, oracle-parity rule (P12), scope exclusion, authorization routing, limit defaults/cap, route ordering requirement, computePathHash input format, and DocsService constants. All claims verified against the implementation.
- One active documentation concern: docs/features/documents.md:63 states "Non-readable ancestors are included; the breadcrumb is navigational." This is accurate for the current implementation but describes the WARNING-finding behavior. When the breadcrumb filtering fix lands, this line must be updated. This concern is carried forward (not a new finding; previously noted by the security review).
- docs/README.md routing table row for documents.md is present at line 18 with correct scope description: "wiki page tree, read API (path resolution, tree, breadcrumbs, recent feed), oracle-parity contract, computePathHash". The code paths column correctly references `apps/api/src/docs/` and `apps/web/app/docs/`. Accurate and complete.
- Documentation follows the "current state only" rule (no milestone/subtask history in the doc). The doc does not restate facts from api-conventions.md or authorization.md beyond minimal cross-links. No duplication detected.

---

Security review assessment (verifier pass, incorporating security stage findings):
- The specialist security review found 0 blocking findings, 1 WARNING (breadcrumb ancestor visibility leak — non-exploitable in ST-2, must be fixed before ST-3), and 2 notes. The verifier independently confirms these findings.
- No additional security issues found in this verifier pass. No hardcoded secrets, no injection vectors (pathHash is a SHA-256 hex string used in a TypeORM where clause, not a raw SQL interpolation), no bypass of the central gate, and no 403-vs-404 distinction that would create an oracle.
- The `limit` parameter is parsed via parseInt and then Math.min/Math.max clamped — no integer overflow or negative-value DOS vector.

---

Verdict:
- CONDITIONAL PASS

Rationale: All five acceptance criteria are satisfied. No blocking defects were found. The one WARNING (breadcrumb ancestor visibility leak) is non-exploitable in ST-2 alone, was previously identified and confirmed by the specialist security review, and has an explicit remediation gate before ST-3. The test gap (no negative breadcrumb test) is bounded and defined. The implementation, tests, and documentation are otherwise correct, well-structured, and convention-compliant.
