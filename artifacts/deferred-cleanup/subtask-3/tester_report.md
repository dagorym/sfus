# Tester Report — deferred-cleanup subtask-3

## Task
Security data minimization + oracle removal on blog comment endpoints.

## Testing Scope

**Goal:** Validate that the implementer changes correctly:
1. Strip `authorUserId`, `moderatedByUserId`, `moderatedAt` from public comment responses (`listComments`, `createComment`)
2. Preserve those fields on admin/moderation endpoints (`moderationListComments`, `moderateCommentStatus`)
3. Normalize `parentId` rejection to a single message (`"parentId is invalid."`) across both failure cases
4. Normalize `imageId` rejection to a single message (`"imageId is invalid."`) across both failure cases
5. Remove references to trimmed fields from web mirror types in `blog-client.ts`
6. Swagger decorators and JSDoc accurately reflect the new contract

**Test Files Modified:**
- `apps/api/src/blog/blog.service.test.ts`
- `apps/api/src/blog/blog.controller.test.ts`
- `apps/web/app/blog/blog.spec.ts`

**Shared Artifact Directory:** `artifacts/deferred-cleanup/subtask-3`

## Acceptance Criteria Results

| AC | Description | Result |
|----|-------------|--------|
| AC1 | Public comment payloads omit authorUserId, moderatedByUserId, moderatedAt | PASS |
| AC2 | Admin/moderation behavior unchanged — full fields still present | PASS |
| AC3 | parentId rejections each return single uniform message/class | PASS |
| AC3 | imageId rejections each return single uniform message/class | PASS |
| AC4 | Swagger response models and JSDoc match new contract | PASS |
| AC5 | Zero web references to trimmed fields in BlogCommentDetail | PASS |

## Tests Added

### blog.service.test.ts — Oracle-Parity Tests (6 new tests)

**`BlogService.createComment parentId oracle-parity: uniform 400 message (subtask-3)`**
- `nonexistent parentId yields 'parentId is invalid.' (same message as foreign-post case)` — PASS
- `parentId belonging to a different post yields 'parentId is invalid.' (same message as nonexistent case)` — PASS
- `both parentId failure cases produce identical messages (oracle-parity assertion)` — PASS

**`BlogService.createComment imageId oracle-parity: uniform 400 message (subtask-3)`**
- `nonexistent imageId yields 'imageId is invalid.' (same message as wrong-scope case)` — PASS
- `imageId with wrong resourceType yields 'imageId is invalid.' (same message as nonexistent case)` — PASS
- `both imageId failure cases produce identical messages (oracle-parity assertion)` — PASS

### blog.controller.test.ts — Data Minimization Source Contracts (29 new tests)

**`PublicBlogCommentDetail omits sensitive fields (subtask-3 AC1)`** — 4 tests PASS
- Interface body excludes field declarations for authorUserId, moderatedByUserId, moderatedAt
- BlogCommentDetail interface body includes them
- toPublicCommentDetail return body omits them
- toCommentDetail return body serializes them

**`listComments and createComment use public serializer (subtask-3 AC1)`** — 2 tests PASS
**`moderationListComments and moderateCommentStatus use full serializer (subtask-3 AC2)`** — 2 tests PASS
**`Swagger ApiOkResponse descriptions reflect data minimization (subtask-3 AC4)`** — 2 tests PASS
**`parseCreateInput, parseUpdateInput, parsePublishAtInput rejection paths (subtask-3 AC3)`** — 3 tests PASS
**`resolveSession + assertAdminManagementAccess wiring on admin handlers (subtask-3 AC3)`** — 9 tests PASS (one per admin handler)

### blog.spec.ts — Web Mirror Type Contracts (7 new tests)

**`blog-client.ts BlogCommentDetail type: trimmed fields absent (subtask-3 AC5)`** — 5 tests PASS
- authorUserId absent from BlogCommentDetail
- moderatedByUserId absent from BlogCommentDetail
- moderatedAt absent from BlogCommentDetail
- Public fields remain (positive baseline)
- Zero references to authorUserId after BlogCommentDetail interface

**`blog-client.ts BlogCommentDetail JSDoc documents security trimming (subtask-3 AC5)`** — 1 test PASS

## Test Execution Summary

**Command:** `npx --yes pnpm@10.0.0 --dir <worktree> test`

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| API tests | 297 | 325 | +28 new tests |
| Web tests | 245 | 251 | +6 new tests |

**Final totals:**
- API: 325 passed, 2 skipped (integration tests requiring live DB)
- Web: 251 passed
- Lint: clean (0 errors, 0 warnings)
- Typecheck: clean
- Build: clean

## Additional Checks

- `npx --yes pnpm@10.0.0 typecheck` — PASS (no TS errors)
- `npx --yes pnpm@10.0.0 lint` — PASS (0 warnings)
- `npx --yes pnpm@10.0.0 --filter @sfus/api build` — PASS

## Test Commit

Hash: `6701103`
Branch: `cleanup-subtask-3-tester-20260607`

## Implementation Defects Found

None. All acceptance criteria are met by the implementation.

## Cleanup

No temporary byproducts were created. Only test files in the tester-owned directories were modified.
