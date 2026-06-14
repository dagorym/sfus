Security Review Report

Scope reviewed:
- Milestone 5 subtask ST-4: Documents tree management — slug/title rename with transactional subtree path/path_hash rewrite (renamePage), staff soft-delete (softDeletePage), and the ST-3 resolveParent asymmetry fix.
- Product code: apps/api/src/docs/docs.service.ts (renamePage, softDeletePage, resolveParent), apps/api/src/docs/docs.controller.ts (PATCH /api/docs/:id, DELETE /api/docs/:id), apps/api/src/docs/docs.types.ts (RenameDocPageInput).
- Tests: apps/api/src/docs/docs.service.test.ts, docs.controller.test.ts, docs.service.integration.test.ts; apps/api/src/pages/integration-test-support.ts (docs_pages cleanup helper).
- Docs: docs/features/documents.md (PATCH/DELETE routes + parent-resolution note).
- Method: read-only diff review against coordination base branch ms5; no files modified other than the required security artifacts.

Why specialist review was triggered:
- Planner marked ST-4 'Security review: required' due to the authorization surface plus path-rewrite integrity/leak surface: a defect could corrupt the tree, orphan or expose gated content, or let a non-staff actor mutate the tree.
- Destructive/structural operations (subtree path rewrite, soft-delete) combined with a moderator/admin-only authorization boundary and oracle-parity (P12) requirements for hidden vs nonexistent pages.

Acceptance criteria / plan reference:
- MS5 plan ST-4 acceptance criteria: AC1 atomic slug rename + descendant path/path_hash rewrite (P10); AC2 title-only rename leaves paths untouched; AC3 soft-delete sets status='deleted', preserves revisions; AC4 409 when non-deleted children exist; AC5 single assertDocWriteAccess seam (401 before 403, staff-only for site scope).
- Cross-cutting properties: P10 transactional atomicity; P12 oracle parity (gated === nonexistent 404 with PAGE_NOT_FOUND_MESSAGE); ST-3 resolveParent symmetry fix (reject soft-deleted parents via both parentId and parentPath).

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/docs/docs.service.integration.test.ts:327 - The renamePage 'mid-rename transaction failure' atomicity test does not exercise the real renamePage() rollback path; it runs a hand-written raw-SQL transaction that forces a unique-key violation and asserts the DB rolled back.
  It proves the DB engine (InnoDB) provides transactional rollback rather than proving renamePage's own descendant-loop rollback. The atomicity property is still well-supported because the production code visibly wraps the parent update + collision check + descendant loop in one pageRepository.manager.transaction, and a companion integration test exercises the real happy-path parent+child rewrite; but no integration test injects a mid-loop fault through the real service to prove the already-updated parent path rolls back. Non-blocking.
- apps/api/src/docs/docs.service.ts:653 - No test asserts the LIKE-prefix no-over-match property for sibling paths that share a string prefix (e.g. renaming 'foo' must not rewrite a sibling 'foobar').
  The descendant scan uses prefix `${oldPath}/%` (oldPath + '/'), which structurally excludes a sibling like 'foobar' because it does not start with 'foo/'. The logic is correct by construction, but the absence of an explicit regression test leaves the property unguarded against future edits to the prefix derivation. Slugs are validated to [a-z0-9-] so stored paths cannot contain LIKE wildcards (% or _), and the query is parameterized — no LIKE-wildcard injection exists. Non-blocking.
- apps/api/src/database/migrations/1781308800000-milestone-five-documents-foundation.ts:61 - The unique index uq_docs_pages_scope_path_hash spans (scope_type, scope_id, path_hash) and does not include status, so a descendant whose rewritten path_hash collides with any existing row (including a soft-deleted one) triggers a raw unique-constraint error inside the rename transaction rather than a clean 409.
  This is fail-safe for integrity: the constraint violation rolls back the entire transaction, so no partial/corrupt tree results — tree integrity is preserved. The only downside is a 500-shaped error rather than a 409 for the rare descendant-collision case (the renamed page's own path_hash IS pre-checked and returns a clean 409). No exposure or corruption; documented here as a robustness observation, not a defect.

Test sufficiency assessment:
- Authorization (AC5): STRONG. Controller unit tests assert resolveSession (401) runs before assertDocWriteAccess (403) via mock invocationCallOrder, that the seam is called with ('moderator','site'), and that 401/403/404/409 propagate for both PATCH and DELETE. AuthorizationService.hasGlobalRole rejects null/empty (anonymous) and 'user' (rank 0 < moderator); a non-staff caller cannot rename or delete.
- Path-rewrite integrity (AC1/P10): ADEQUATE. Unit tests confirm em.update is called once per node (parent+child+grandchild) on slug change, the title-only path issues a single update touching only the title (no slug/path/pathHash) and never scans descendants, and the new-path collision check returns 409. An integration test proves the real service rewrites parent+child paths against a real MySQL schema. GAP (NOTE): the integration 'rollback' test is a DB-capability proxy, and there is no explicit sibling no-over-match regression test.
- Oracle parity / leak surface (P12): STRONG. Tests assert rename and soft-delete of nonexistent and already-deleted pages both return the identical PAGE_NOT_FOUND_MESSAGE 404, and the 409 children message is generic (no child details). All ST-2 read paths filter status='published', so soft-deleted pages and descendants disappear from reads.
- Soft-delete safety (AC3/AC4): STRONG. Unit tests confirm status='deleted' update, that update is NOT called when children block the delete (no partial state), the children-count guard counts only status='published' children, and the 409 message mentions children. An integration test confirms status flips to 'deleted' and revisions are preserved for a leaf, and that a parent with a published child is rejected 409.
- resolveParent fix: ADEQUATE. Unit tests confirm a soft-deleted parent referenced by parentId now yields BadRequestException (parity with the parentPath branch), and a published parent still resolves. Both branches filter status='published' in the product code.

Documentation / operational guidance assessment:
- docs/features/documents.md accurately documents PATCH /api/docs/:id (slug-change subtree rewrite vs title-only no-op, deferred cross-parent move) and DELETE /api/docs/:id (status='deleted', revisions preserved, 409 children guard) including full 400/401/403/404/409/429 error tables and the doc-page-edit throttle label.
- A new 'Parent resolution' section documents that both resolveParent branches filter status='published' and reject soft-deleted parents with 400 'Parent page does not exist.' — matching the implementation.
- Documentation is sufficient for safe operation; no security-relevant gaps identified.

Artifacts written:
- artifacts/ms5-documents-wiki/ST-4/security_report.md
- artifacts/ms5-documents-wiki/ST-4/security_result.json

Outcome:
- PASS
