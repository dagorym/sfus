# Implementer Report

Status: success

Task: ms3-completion-and-copilot-port/subtask-4
Branch: ms3-claude-implementer-subtask-4-20260603
Implementation commit: 33200dc

## Task Summary

Complete Milestone 3 blog comment behavior on ms3-claude: persist comment media reference with
blog-comment scope validation, implement 1-level threaded comments with parentId enforcement,
implement comment-thread locking (commentsLocked), and confirm existing
public-read/auth-member-write/moderation flows.

## Changed Files

- apps/api/src/blog/blog.service.ts
- apps/api/src/blog/blog.controller.ts
- apps/web/app/blog/[slug]/page.tsx
- apps/web/app/blog/blog-client.ts
- docs/README.md

## Validation Results

| Command | Outcome |
|---------|---------|
| npx --yes pnpm@10.0.0 lint | PASS |
| npx --yes pnpm@10.0.0 typecheck | PASS (pre-existing multer type error in media.controller.ts, file unchanged from HEAD, outside scope) |
| npx --yes pnpm@10.0.0 test | 193 API tests pass (49 blog service), 118 web tests pass. Pre-existing failure in media.controller.test.ts (multer package missing, file unchanged, outside scope) |

## Acceptance Criteria Status

AC1 PASS: Guests read visible comments on published posts; authenticated members create
comments on eligible published, unlocked posts; replies nest at most 1 level; deeper nesting
rejected with BadRequestException (400).

AC2 PASS: imageId is no longer dropped. Persisted as mediaReferenceId after scope validation:
mediaRecord.resourceType must equal "blog-comment" or the request is rejected with 400.

AC3 PASS: lock/unlock routes added (POST /api/blog/admin/posts/:id/lock-comments and
/unlock-comments, moderator/admin gated). Locked posts reject createComment with ForbiddenException
(403). UI shows a locked-thread notice and hides the comment form and reply buttons.

AC4 PASS: Shared sanitization model confirmed: normalizeMarkdownBody + validateMarkdownBody
applied to all comment bodies. Unpublished/draft/future-scheduled parent post guard confirmed
(post.status !== "published" || !post.publishedAt || post.publishedAt > now => 403).

## Implementation Notes

### blog.service.ts
- createComment: added commentsLocked guard (ForbiddenException), parentId 1-level nesting
  guard (BadRequestException if parent.parentId !== null), imageId scope guard
  (BadRequestException if resourceType !== "blog-comment"), persists parentId and
  mediaReferenceId on created entity.
- Added lockComments(postId) and unlockComments(postId) methods.
- findVisibleComments: now loads "replies" relation for threaded response.

### blog.controller.ts
- listComments: returns {comments: BlogCommentDetail[], commentsLocked: boolean}; filters to
  top-level comments (parentId === null); maps visible replies into each comment.
- Added POST lock-comments and unlock-comments routes (moderator/admin via assertModerationAccess).
- BlogCommentDetail: added parentId, mediaReferenceId, optional replies[].
- Added toCommentDetailWithReplies helper.
- BlogPostDetail: added commentsLocked field.
- parseCreateCommentInput: now extracts parentId from request body.

### blog-client.ts
- listComments: return type changed to {comments, commentsLocked}.
- createComment: added optional parentId parameter.
- Added adminLockComments and adminUnlockComments exported helpers.
- BlogCommentDetail and BlogPostDetail interfaces updated to match API.

### page.tsx (apps/web/app/blog/[slug]/page.tsx)
- Loads commentsLocked from listComments response; shows locked-thread notice.
- Hides comment form and reply buttons when commentsLocked.
- Renders nested visible replies under each top-level comment.
- Adds inline reply form per top-level comment for authenticated members.
- handleSubmitReply: creates a reply with parentId, inserts into local state.

## Pre-existing Failure (not a regression)

apps/api/src/media/media.controller.test.ts: "Cannot find package 'multer'" — pre-existing
missing dependency, file unchanged from HEAD, outside allowed scope. Carry forward for Tester.

## Artifacts

- artifacts/ms3-completion-and-copilot-port/subtask-4/implementer_report.md
- artifacts/ms3-completion-and-copilot-port/subtask-4/implementer_result.json
- artifacts/ms3-completion-and-copilot-port/subtask-4/tester_prompt.txt
