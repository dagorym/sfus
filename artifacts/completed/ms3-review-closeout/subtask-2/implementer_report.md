# Implementer Report

Status:
- success

Task summary:
- Fix all remaining payload?.message-only error reads in apps/web/app/pages/pages-client.ts (8 locations) and apps/web/app/blog/blog-client.ts (15 total locations) to use the payload?.error?.message || payload?.message || <fallback> chain, matching the API's JsonExceptionFilter envelope shape { error: { code, message, statusCode }, request: {...} }.

Changed files:
- apps/web/app/pages/pages-client.ts
- apps/web/app/blog/blog-client.ts

Validation commands run:
- npx --yes pnpm@10.0.0 --filter @sfus/web exec vitest run app/pages/pages.spec.ts
- npx --yes pnpm@10.0.0 --filter @sfus/web exec vitest run app/blog/blog.spec.ts
- npx --yes pnpm@10.0.0 --filter @sfus/web run lint
- npx --yes pnpm@10.0.0 --filter @sfus/web run typecheck
- npx --yes pnpm@10.0.0 --filter @sfus/web run test

Validation outcome:
- PASS — all 172 web tests pass; web lint and typecheck clean. Pre-existing lint failure in apps/api/src/navigation/navigation.controller.test.ts (@typescript-eslint/no-unused-vars for UnauthorizedException) is outside allowed file scope and pre-existed before our changes (confirmed via git stash baseline check).

Implementation/code commit hash:
- e1fc59d

Artifacts written:
- artifacts/ms3-review-closeout/subtask-2/implementer_report.md
- artifacts/ms3-review-closeout/subtask-2/tester_prompt.txt
- artifacts/ms3-review-closeout/subtask-2/implementer_result.json

Implementation context:
- The API's JsonExceptionFilter envelope is { error: { code, message, statusCode }, request: {...} }. Previously, most client calls read payload?.message (always undefined for envelope responses), collapsing every failure to the generic fallback.
- The fix adds payload?.error?.message as the first read in the chain, with payload?.message as a legacy fallback for non-envelope responses (network failures, non-JSON bodies). Only the type annotation and the throw new Error() line changed at each location.
- blog-client.ts: 15 locations fixed — adminListAllPosts, adminGetPost, adminUpdatePost, adminPublishPost, adminUnpublishPost, adminPublishAt, adminToggleFeatured, adminDeletePost, listComments, createComment, adminLockComments, adminUnlockComments, moderationListComments, moderateCommentStatus, deleteComment.
- pages-client.ts: 8 locations fixed — adminListAllPages, adminGetPage, adminCreatePage, adminUpdatePage, adminPublishPage, adminUnpublishPage, adminListRevisions, adminRestoreRevision.
- The adminCreatePost function in blog-client.ts was already partially fixed by the previous plan (correct pattern, but type annotation was { error?: { message?: string }; message?: string }); it was included in the 15-location count and the type annotation was verified correct.

Expected validation failures carried forward:
- Full workspace lint (npx --yes pnpm@10.0.0 lint) fails due to a pre-existing @typescript-eslint/no-unused-vars error in apps/api/src/navigation/navigation.controller.test.ts — outside allowed file scope, not caused by our changes. Web-only lint passes cleanly.
