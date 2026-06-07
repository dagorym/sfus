# Tester Report

Status:
- success

Task summary:
- ms3-review-closeout subtask-8: closed the authenticated existence oracle on POST /api/blog/:postIdOrSlug/comments. Non-public posts (draft, unpublished, future-scheduled) must be indistinguishable from nonexistent ones on the comment-creation path. Two changes: (1) resolvePostId in blog.controller.ts uses findPublishedById instead of findById for the UUID fallback; (2) createComment in blog.service.ts non-public guard changed from ForbiddenException to NotFoundException. The commentsLocked ForbiddenException is intentionally preserved.

Branch name:
- ms3-claude-subtask-8-tester-20260606

Test commit hash:
- 4bc93eb

Test files added or modified:
- apps/api/src/blog/blog.service.test.ts (modified: 3 ForbiddenException->NotFoundException, tightened LessThanOrEqual predicate assertions, added oracle-parity suite, locked-public-post regression)
- apps/api/src/blog/blog.controller.test.ts (created: pins resolvePostId slug-then-id fallback wiring and published-only predicate on both branches)

Commands run:
- pnpm install --frozen-lockfile (worktree context: /home/tstephen/repos/worktrees/ms3-claude-subtask-8-tester-20260606)
- pnpm --filter @sfus/api exec vitest run src/blog/ (worktree context)
- pnpm --filter @sfus/api run build (worktree context)
- pnpm typecheck (worktree context)
- pnpm lint (worktree context -- 1 pre-existing navigation.controller.test.ts failure, unrelated)

Pass/fail totals:
- passed: 83 (79 blog service tests + 4 blog controller tests)
- failed: 0
- note: 6 pre-existing failures in navigation.controller.test.ts (ENOENT path duplication bug in that test file, unrelated to this subtask)

Unmet acceptance criteria:
- None

Final test outcomes:
- AC1 PASS: POST /api/blog/:postIdOrSlug/comments returns NotFoundException for nonexistent, draft, unpublished, and future-scheduled posts -- all produce identical 404.
- AC1 PASS: Oracle-parity suite (blog.service.test.ts) confirms all 4 non-public post variants throw NotFoundException with identical message 'Blog post not found.' -- single-message parity test verifies no observable difference.
- AC2 PASS: Comment creation on genuinely public posts is unchanged (published + publishedAt in past succeeds).
- AC2 PASS: Locked public post regression: ForbiddenException with message 'Comments are locked on this post.' is preserved -- commentsLocked guard intentionally retained.
- AC3 PASS: All other comment routes (list, moderation, lock/unlock) behaviorally unchanged -- no modifications to those paths.
- AC4 PASS (security): No authenticated member can distinguish non-public post from nonexistent via createComment -- oracle-parity suite verifies identical NotFoundException on all 4 non-public variants.
- AC5 PASS: API builds (tsc exits 0), typechecks (tsc --noEmit exits 0), and blog unit suite passes (83 blog tests).
- REGRESSION PASS: findPublishedBySlug predicate assertion tightened to verify LessThanOrEqual operator type (.type === 'lessThanOrEqual') rather than just publishedAt key presence.
- REGRESSION PASS: findPublishedById predicate assertion tightened to verify LessThanOrEqual operator type (.type === 'lessThanOrEqual').
- REGRESSION PASS (controller): blog.controller.test.ts pins resolvePostId slug-then-id fallback: slug branch resolves post without calling UUID fallback; UUID fallback is called when slug misses; both branches apply published-only predicate returning null for non-public posts.
- LINT NOTE: 1 pre-existing lint error in navigation.controller.test.ts (unused import of UnauthorizedException line 4) -- not introduced by this subtask.

Changes justified:
- blog.service.test.ts L637: Renamed 'throws ForbiddenException' to 'throws NotFoundException' -- required because behavior intentionally changed (future-dated post now returns 404 not 403).
- blog.service.test.ts L749: Renamed 'throws ForbiddenException' to 'throws NotFoundException' -- same rationale (draft post now returns 404).
- blog.service.test.ts L849: Renamed 'throws ForbiddenException' to 'throws NotFoundException' -- same rationale (unpublished post now returns 404).
- blog.service.test.ts findPublishedBySlug predicate: Tightened from .toHaveProperty('publishedAt') to verifying .type === 'lessThanOrEqual' on the FindOperator.
- blog.service.test.ts findPublishedById predicate: Same tightening -- verifies TypeORM LessThanOrEqual operator, not just key presence.

Cleanup status:
- No temporary byproducts created. All files are either committed test files or required artifact outputs.

Artifacts written:
- artifacts/ms3-review-closeout/subtask-8/tester_report.md
- artifacts/ms3-review-closeout/subtask-8/tester_result.json
- artifacts/ms3-review-closeout/subtask-8/documenter_prompt.txt
