# Implementer Report

Status:
- success

Task summary:
- Trim authorUserId, moderatedByUserId, and moderatedAt from public comment responses (listComments, createComment). Normalize parentId and imageId rejection oracles to single uniform 400 messages per field. Update web mirror types. Update Swagger decorators.

Changed files:
- apps/api/src/blog/blog.controller.ts
- apps/api/src/blog/blog.service.ts
- apps/web/app/blog/blog-client.ts

Validation commands run:
- npx --yes pnpm@10.0.0 typecheck
- npx --yes pnpm@10.0.0 lint
- npx --yes pnpm@10.0.0 test
- npx --yes pnpm@10.0.0 --filter @sfus/api build

Validation outcome:
- All passed: typecheck clean, lint 0 warnings, 542 tests passed (2 skipped integration), API tsc build clean.

Implementation/code commit hash:
- d59ad3b

Artifacts written:
- artifacts/deferred-cleanup/subtask-3/implementer_report.md
- artifacts/deferred-cleanup/subtask-3/tester_prompt.txt
- artifacts/deferred-cleanup/subtask-3/implementer_result.json

## Implementation Details

### Serializer split (blog.controller.ts)

Introduced a new `PublicBlogCommentDetail` interface that omits `authorUserId`, `moderatedByUserId`, and `moderatedAt`. The existing `BlogCommentDetail` now extends `PublicBlogCommentDetail` and is kept for admin/moderation use.

Two new functions were added:
- `toPublicCommentDetail(comment)` — returns `PublicBlogCommentDetail`; used by PUBLIC endpoints.
- `toPublicCommentDetailWithReplies(comment)` — returns `PublicBlogCommentDetail` with nested replies; used by `listComments`.

The existing `toCommentDetail(comment)` is retained unchanged for admin/moderation endpoints.

### Endpoint classification

Public endpoints (now use trimmed `PublicBlogCommentDetail`):
- `GET /:postId/comments` (listComments) — guest-accessible
- `POST /:postId/comments` (createComment) — authenticated member

Admin/moderation endpoints (unchanged, still use full `BlogCommentDetail` with all fields):
- `GET /moderation/comments/:postId` (moderationListComments) — moderator/admin
- `PATCH /moderation/comments/:commentId/status` (moderateCommentStatus) — moderator/admin

### Oracle normalization (blog.service.ts)

`parentId` validation: both "not found" and "parent belongs to different post" now throw `BadRequestException("parentId is invalid.")`. A caller can no longer distinguish whether a parent comment id is nonexistent or valid-but-foreign to the post being commented on.

`imageId` validation: both "media record does not exist" and "media record is wrong resource type" now throw `BadRequestException("imageId is invalid.")`. A caller can no longer distinguish whether an image id is nonexistent or valid-but-scoped-to-a-different-resource-type.

The nesting-depth check ("Replies cannot be nested more than one level deep.") is unchanged — it fires only after `parentId` is confirmed valid for the post.

### Web mirror types (apps/web/app/blog/blog-client.ts)

`BlogCommentDetail` in the web client had `authorUserId`, `moderatedByUserId`, and `moderatedAt`. All three were removed. A JSDoc comment was added explaining that these fields are stripped server-side. Zero references to the trimmed fields remain in `apps/web/`.

### Swagger decorators

- `listComments @ApiOkResponse`: updated to note the response omits moderation-internal fields.
- `createComment @ApiBadRequestResponse`: updated to mention invalid parentId/imageId references.
- `moderationListComments @ApiOkResponse`: added, documents that full payload including moderation fields is returned.
- `moderateCommentStatus @ApiOkResponse`: added, documents that full payload including moderation fields is returned.

Expected validation failures carried forward:
- None
