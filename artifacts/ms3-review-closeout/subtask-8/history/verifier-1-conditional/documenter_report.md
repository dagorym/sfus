# Documenter Report

Status:
- pass

Task summary:
- ms3-review-closeout subtask-8: closed the authenticated existence oracle on POST /api/blog/:postIdOrSlug/comments. Non-public posts (draft, unpublished, future-scheduled) are now indistinguishable from nonexistent ones on the comment-creation path. resolvePostId in blog.controller.ts uses findPublishedById instead of findById for the UUID fallback so a non-public post by UUID is treated identically to a nonexistent one at the controller layer. createComment in blog.service.ts non-public guard changed from ForbiddenException to NotFoundException (defense-in-depth). The commentsLocked ForbiddenException is intentionally preserved.

Branch name:
- ms3-claude-subtask-8-documenter-20260606

Documentation commit hash:
- 3ba4cd6

Documentation files added or modified:
- docs/README.md

Documentation changes:
- docs/README.md line 199: updated future-scheduled comment response from 403 to 404 with oracle disclosure note
- docs/README.md line 253: updated POST /api/blog/:postId/comments response code table — 404 for non-public/nonexistent, 403 only for commentsLocked=true on a public post
- docs/README.md line 269: updated Comment Authorization Model paragraph — 404 for draft/unpublished/future-scheduled, 403 for commentsLocked on public post only

Commands run:
- pnpm install --frozen-lockfile (worktree context)
- pnpm --filter @sfus/api exec vitest run src/blog/ -- 83 tests pass
- pnpm --filter @sfus/api run build -- exits 0
- pnpm typecheck -- exits 0
- pnpm lint -- 1 pre-existing navigation.controller.test.ts error (unrelated)

Final test outcomes:
- 83 blog tests pass (79 service + 4 controller); 0 failures introduced by this subtask.
- Oracle-parity suite confirms all 4 non-public post variants (nonexistent/draft/unpublished/future-scheduled) throw NotFoundException with identical message.
- commentsLocked ForbiddenException regression passes -- guard is preserved for locked public posts.
- resolvePostId controller wiring pinned: slug branch resolves without UUID fallback; UUID fallback called when slug misses; both branches apply published-only predicate.
- LessThanOrEqual predicate assertions tightened for findPublishedBySlug and findPublishedById.

Assumptions:
- None

Artifacts written:
- artifacts/ms3-review-closeout/subtask-8/documenter_report.md
- artifacts/ms3-review-closeout/subtask-8/documenter_result.json
- artifacts/ms3-review-closeout/subtask-8/verifier_prompt.txt
