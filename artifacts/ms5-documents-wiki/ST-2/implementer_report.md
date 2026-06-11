# Implementer Report

Status:
- success

Task summary:
- Implement ST-2 — the Documents read API (path resolution, tree, breadcrumbs, recent feed) for Milestone 5. DocsService and DocsController provide: GET /api/docs/*path (resolve a published site page by full path_hash, return current revision body plus ordered breadcrumb ancestry); GET /api/docs (site root tree or children of ?parentPath=); GET /api/docs/recent?limit= (recent publicly-readable site-scope non-deleted document edits for the landing feed). All visibility routed through AuthorizationService.evaluate() with anonymous actor. Project-scoped pages excluded from every site index. Oracle parity (P12): nonexistent, deleted, and non-readable pages all return PAGE_NOT_FOUND_MESSAGE (identical 404, no 403 vs 404 distinction).

Changed files:
- apps/api/src/docs/docs.service.ts
- apps/api/src/docs/docs.controller.ts
- apps/api/src/docs/docs.module.ts
- apps/api/src/docs/docs.types.ts

Validation commands run:
- npx --yes pnpm@10.0.0 lint
- npx --yes pnpm@10.0.0 typecheck
- npx --yes pnpm@10.0.0 test
- npx --yes pnpm@10.0.0 --filter @sfus/api exec tsc -p tsconfig.json

Validation outcome:
- All pass. 1003 tests passed (11 skipped — DB integration, gated on SFUS_DB_INTEGRATION=1). Lint and typecheck clean.

Implementation/code commit hash:
- a3e6d0d

Artifacts written:
- artifacts/ms5-documents-wiki/ST-2/implementer_report.md
- artifacts/ms5-documents-wiki/ST-2/tester_prompt.txt
- artifacts/ms5-documents-wiki/ST-2/implementer_result.json

Implementation context:
- DocsService.isPagePubliclyReadable(page) mirrors ForumsService.isBoardPubliclyReadable: scopeType !== 'site' → false; then AuthorizationService.evaluate() with anonymous actor { userId: null, globalRole: '' }.
- DocsService.PAGE_NOT_FOUND_MESSAGE = 'Document page not found.' — static constant, single source of truth for oracle parity. Throw new NotFoundException(DocsService.PAGE_NOT_FOUND_MESSAGE) in all gated read paths.
- DocsService.computePathHash(scopeType, scopeId, path) is public — ST-3 must use it with the same SHA-256('scopeType:scopeId:path') formula when creating pages.
- Path normalization: trim whitespace and strip leading/trailing slashes before hashing.
- GET /docs/recent is declared before GET *path in the controller — NestJS route priority ensures 'recent' is not treated as a path segment.
- Recent feed: joins revision.page.current_revision_id = revision.id, orders by revision.createdAt DESC, takes limit items from the allow-listed public page ids.
- DocsTreeItem.hasChildren is always false in ST-2; ST-3+ can enhance with a child-count query.
- Breadcrumb chain walks parentId links up to root, then reverses for display order (root first).
- DocsModule now imports AuthorizationModule and exports DocsService for downstream subtasks.

Expected validation failures carried forward:
- None
