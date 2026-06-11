# Tester Report

Status:
- success

Task summary:
- ST9 — Enforce the ST8 throttle + link-limit on forum posting (createTopic, createPost) and blog comment creation (createComment). Implementation commit 9575004 on branch ms4-st9-implementer-20260608 wired ThrottleService.checkRequest and exceedsLinkLimit into all 3 handlers, fetching userCreatedAt from UsersService so the new-account tier activates. ThrottleModule + UsersModule were imported into ForumsModule and BlogModule.

Branch name:
- ms4-st9-tester-20260608

Test commit hash:
- dd2afcd744eff9338babe18f9959e4d59c3a6c26

Test files added or modified:
- apps/api/src/forums/forums.controller.test.ts
- apps/api/src/blog/blog.controller.test.ts

Commands run:
- pnpm --dir <worktree> install --frozen-lockfile
- vitest run --root apps/api
- pnpm typecheck
- pnpm lint

Pass/fail totals:
- failed: 0
- passed: 788
- skipped: 2

Unmet acceptance criteria:
- None

Final test outcomes:
- 788 tests pass, 0 failures (23 new ST9 tests added across forums and blog controller test files).
- forums.controller.test.ts and blog.controller.test.ts both appear in the vitest run.
- Typecheck: 0 errors. Lint: 0 warnings.
- All 3 protected sites covered: forum-topic-create, forum-post-create, blog-comment-create.
- Over-limit 429: handler propagates exception, createTopic/createPost/createComment NOT called.
- Under-limit: happy path completes, service spy called.
- Auth gate before throttle: 401 blocks before checkRequest is reached (spy confirmed).
- createdAt wiring: checkRequest called with non-null Date from usersService.findById.
- New-account tier: real ThrottleService + InMemoryThrottleStore: young account (1h old) throttled at hit 3 (newAccountMaxHits=2); old account (10d) passes same 3 hits (maxHits=10). Null-createdAt proof shows tier inactive without wiring.
- Link limit: body with 2 links exceeds maxLinksPerPost=1 -> BadRequestException(400), persist not called.
- Enforcement reuses ST8 ThrottleService + exceedsLinkLimit — no reimplemented throttle logic in controllers confirmed.

Cleanup status:
- None

Artifacts written:
- artifacts/milestone-4-forums/ST9/tester_report.md
- artifacts/milestone-4-forums/ST9/tester_result.json
- artifacts/milestone-4-forums/ST9/documenter_prompt.txt
