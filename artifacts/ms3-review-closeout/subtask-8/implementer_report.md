# Implementer Report

Status:
- SUCCESS

Task summary:
- REMEDIATION PASS 2: Fix stale Swagger decorator on POST /api/blog/:postIdOrSlug/comments createComment handler. The @ApiForbiddenResponse description 'Post is not published.' was stale — non-public posts now return 404 (indistinguishable from nonexistent) via the resolvePostId+createComment defense-in-depth fix from prior pass. Updated @ApiForbiddenResponse to describe the commentsLocked guard ('Comments are locked on this post.') and updated @ApiNotFoundResponse to 'Post not found or not published.' so the OpenAPI spec accurately reflects the implemented behavior.

Changed files:
- apps/api/src/blog/blog.controller.ts

Validation commands run:
- pnpm --filter api run test
- pnpm --filter api run lint
- pnpm --filter api run build

Validation outcome:
- All 263 unit tests pass. Build and lint both fail in navigation.controller.test.ts (pre-existing, unrelated to this change — classified as expected pre-existing failures).

Implementation/code commit hash:
- 624f4586214792235aa25b31432609b485d1c74f

Artifacts written:
- artifacts/ms3-review-closeout/subtask-8/implementer_report.md
- artifacts/ms3-review-closeout/subtask-8/tester_prompt.txt
- artifacts/ms3-review-closeout/subtask-8/implementer_result.json

Implementation context:
- Pass 1 (merged): resolvePostId in blog.controller.ts already uses findPublishedById for UUID fallback so non-public posts resolve to 404.
- Pass 1 (merged): createComment in blog.service.ts already throws NotFoundException('Blog post not found.') for non-public posts as defense-in-depth.
- Pass 2 (this pass): Only change is to Swagger decorators on the createComment handler at blog.controller.ts ~line 268.
- Before: @ApiForbiddenResponse({ description: 'Post is not published.' }) — stale.
- After: @ApiForbiddenResponse({ description: 'Comments are locked on this post.' }) and @ApiNotFoundResponse({ description: 'Post not found or not published.' }).
- Pre-existing build/lint failures in navigation.controller.test.ts are unrelated to this change and should not be treated as regressions.
- commentsLocked ForbiddenException is unchanged — a locked PUBLIC post legitimately shows 403.

Expected validation failures carried forward:
- pnpm --filter api run build — fails due to TS1470 in navigation.controller.test.ts (import.meta in CJS output), pre-existing, unrelated to this task.
- pnpm --filter api run lint — fails due to unused variable in navigation.controller.test.ts, pre-existing, unrelated to this task.
