# Implementer Report

Status: success

## Task Summary

Close the authenticated existence oracle on POST /api/blog/:postIdOrSlug/comments. Non-public posts (draft, unpublished, future-scheduled) must be indistinguishable from nonexistent ones on the comment-creation path. Two targeted changes: (1) resolvePostId in blog.controller.ts uses findPublishedById instead of findById for the UUID fallback so a non-public post by UUID is treated identically to a nonexistent one at the controller layer; (2) createComment in blog.service.ts non-public guard changed from ForbiddenException to NotFoundException (defense-in-depth). The commentsLocked ForbiddenException is intentionally preserved.

## Changed Files

- apps/api/src/blog/blog.controller.ts
- apps/api/src/blog/blog.service.ts

## Implementation Details

### blog.controller.ts (~line 352) — resolvePostId

Both the slug-lookup branch (findPublishedBySlug) and the UUID-fallback branch (now findPublishedById, was findById) apply the same published-only visibility predicate. A non-public post addressed by UUID now silently falls through to the NotFoundException at the controller layer — the service's createComment is never called for that case.

Updated JSDoc to reflect that both branches use the published-only predicate and that non-public posts are invisible here, matching the nonexistent-post 404 response.

### blog.service.ts (~line 382) — createComment non-public guard

The non-public guard (`status !== 'published' || !publishedAt || publishedAt > now`) now throws `NotFoundException('Blog post not found.')` instead of `ForbiddenException('Comments can only be added to published posts.')`. Added a defense-in-depth comment explaining the milestone visibility invariant.

The commentsLocked guard at line ~388 retains `ForbiddenException('Comments are locked on this post.')` because a locked PUBLIC post is legitimately visible and its 403 is not an oracle.

## Validation Commands Run

- npx --yes pnpm@10.0.0 --filter @sfus/api run build
- npx --yes pnpm@10.0.0 lint
- npx --yes pnpm@10.0.0 typecheck
- npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run src/blog/

## Validation Outcome

- Build: PASS
- Typecheck: PASS
- Unit tests (blog service, main sfus workspace): PASS (72/72) — ran against main sfus workspace source (pre-change state); post-merge run will surface the expected behavior-change failures listed below.
- Lint: pre-existing failure in navigation.controller.test.ts (UnauthorizedException unused import, line 4) — unrelated to our changes, not introduced by this subtask.

## Expected Behavior-Change Test Failures (Tester Must Update)

Three tests in apps/api/src/blog/blog.service.test.ts currently expect ForbiddenException for non-public posts in createComment. These will fail after merge because the approved change makes createComment throw NotFoundException instead:

- ~line 661: 'throws ForbiddenException when post is published but publishedAt is in the future'
- ~line 764: 'throws ForbiddenException when post is not published (draft)'
- ~line 873: 'throws ForbiddenException when post is unpublished'

These are expected consequences of the approved behavior change, not regressions. The Tester must update these assertions to NotFoundException and add oracle-parity tests, a locked-public-post 403 regression test, and controller-level tests per the task prompt's Tester guidance.

## Implementation/Code Commit Hash

e94505b

## Artifacts Written

- artifacts/ms3-review-closeout/subtask-8/implementer_report.md
- artifacts/ms3-review-closeout/subtask-8/tester_prompt.txt
- artifacts/ms3-review-closeout/subtask-8/implementer_result.json
