# Implementer Report

Status:
- success

Task summary:
- Implements ST-4: PATCH /api/docs/:id (rename with atomic subtree path rewrite) and DELETE /api/docs/:id (soft-delete with 409 on non-deleted children). Also fixes the resolveParent parentId-branch asymmetry carried forward from ST-3 verifier.

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
- PASS — lint 0 warnings, typecheck 0 errors, 1111 tests passed (19 skipped DB-gated), API tsc build clean

Implementation/code commit hash:
- e7c88aabc697408aaffeab6b488b2061b5126f6e

Artifacts written:
- artifacts/ms5-documents-wiki/ST-4/implementer_report.md
- artifacts/ms5-documents-wiki/ST-4/tester_prompt.txt
- artifacts/ms5-documents-wiki/ST-4/implementer_result.json

Implementation context:
- renamePage (docs.service.ts): when slug changes, derives new path = parent_prefix/new_slug, checks path_hash collision inside transaction, updates page row, then scans descendants via LIKE prefix on the transaction entity manager and updates each descendant path/path_hash. Title-only: only updates the title column.
- softDeletePage (docs.service.ts): loads page, counts non-deleted children (status=published, parentId=pageId). 409 if count > 0. Otherwise sets status=deleted; revisions untouched.
- resolveParent fix (docs.service.ts): parentId branch now adds status=published filter — parity with by-parentPath branch. Prevents creating children under soft-deleted parents.
- PATCH :id controller (docs.controller.ts): calls resolveSession (401), assertDocWriteAccess (403), then docsService.renamePage. Returns 200 {page}.
- DELETE :id controller (docs.controller.ts): calls resolveSession (401), assertDocWriteAccess (403), then docsService.softDeletePage. Returns 204 No Content.
- RenameDocPageInput (docs.types.ts): { slug?: string; title?: string } — at least one must be provided.
- Both routes throttled via ThrottleGuard with THROTTLE_LABEL_DOC_EDIT label.
- Descendant rewrite is done in-process (load all matching the oldPath/ prefix, then update each) to stay within TypeORM transaction boundaries and be MySQL 5.7.44 compatible.

Expected validation failures carried forward:
- None
