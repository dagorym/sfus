# Implementer Report

Status:
- success

Task summary:
- Enforce the ST8 throttle + link-limit at all 3 protected create sites: forum topic create (POST /forums/boards/:boardId/topics), forum post create (POST /forums/topics/:topicId/posts), and blog comment create (POST /blog/:postId/comments). Wire the real user createdAt for the new-account tier. Protected sites: 3.

Changed files:
- apps/api/src/forums/forums.controller.ts
- apps/api/src/forums/forums.module.ts
- apps/api/src/forums/forums.controller.test.ts
- apps/api/src/forums/forums.module.test.ts
- apps/api/src/blog/blog.controller.ts
- apps/api/src/blog/blog.module.ts
- apps/api/src/blog/blog.controller.test.ts
- apps/api/src/common/throttle/throttle.module.ts

Validation commands run:
- pnpm --dir /home/tstephen/repos/worktrees/ms4-st9-implementer-20260608 lint
- pnpm --dir /home/tstephen/repos/worktrees/ms4-st9-implementer-20260608/apps/api run typecheck
- pnpm --dir /home/tstephen/repos/worktrees/ms4-st9-implementer-20260608 exec vitest run --root /home/tstephen/repos/worktrees/ms4-st9-implementer-20260608/apps/api

Validation outcome:
- PASS — lint clean, typecheck 0 errors, 765 tests passed / 2 skipped (DB integration, expected). No regressions.

Implementation/code commit hash:
- 9575004d2b57b31df6682ad477f167876ba51f80

Artifacts written:
- artifacts/milestone-4-forums/ST9/implementer_report.md
- artifacts/milestone-4-forums/ST9/tester_prompt.txt
- artifacts/milestone-4-forums/ST9/implementer_result.json

Implementation context:
- ThrottleService.checkRequest() is called inline in createTopic, createPost, and createComment after resolveSession() succeeds (auth gate is first).
- UsersService.findById(session.user.id) is called after resolveSession() to get the UserEntity with createdAt; this is passed as userCreatedAt to checkRequest() — activating the new-account tier in ThrottleService.
- Route labels injected: THROTTLE_LABEL_TOPIC_CREATE='forum-topic-create', THROTTLE_LABEL_POST_CREATE='forum-post-create', THROTTLE_LABEL_BLOG_COMMENT='blog-comment-create'.
- THROTTLE_CONFIG is injected as a constructor param (@Inject(THROTTLE_CONFIG)) in both ForumsController and BlogController.
- exceedsLinkLimit(body, throttleConfig.maxLinksPerPost) is called on the Markdown body string before persistence; violation throws BadRequestException(400).
- ThrottleModule.register(environment) and UsersModule are now imported in ForumsModule and BlogModule.
- ThrottleModule now exports THROTTLE_CONFIG so controllers can inject it.
- Existing test fixtures updated (P7 breadth): forums.controller.test.ts makeController() now passes ThrottleService, UsersService, ThrottleConfig stubs; forums.module.test.ts fake environments now include throttle property; blog.controller.test.ts makeController() now passes the three new params.
- Security: auth gate (resolveSession 401) runs before link-limit and throttle checks. 401/403/404 semantics are unchanged.

Expected validation failures carried forward:
- None
