# Implementer Report — ST4

**Status:** success
**Branch:** ms4-st4-implementer-20260608
**Code commit:** b73d475

## Task Summary

Implement ST4 — Topics: create (member-authenticated), paginated public read, visibility predicate enforcement, pinned ordering, oracle-parity 404, and safe public topic shape.

## Changed Files

- `apps/api/src/forums/forums.controller.ts`
- `apps/api/src/forums/forums.service.ts`
- `apps/api/src/forums/forums.types.ts`
- `apps/api/src/forums/forums.service.test.ts` (P7 breadth: updated factory for new constructor arg)

## Validation Commands Run

- `pnpm --dir apps/api typecheck` — PASS (0 errors)
- `pnpm lint` — PASS (0 warnings)
- `pnpm exec vitest run --root apps/api` — PASS (660 tests, 2 skipped DB-gated)
- `pnpm --dir apps/api build` — PASS (API tsc build clean)

## Implementation Context

**ForumsService.createTopic** (new):
- 401 resolved at controller layer via `authService.resolveSession` before service call.
- Full board visibility gate re-enforced via `isBoardPubliclyReadable(board)` (calls `AuthorizationService.evaluate()`) — nonexistent or gated board → uniform 404 using `TOPIC_NOT_FOUND_MESSAGE` constant (oracle parity, P12).
- `normalizeMarkdownBody` then `validateMarkdownBody` before any DB write; unsafe content → 400 BadRequestException.
- Generates URL-safe slug from title (lowercase, non-alphanumeric → hyphen, max 200 chars).
- Saves topic, reloads with `author` relation, maps via `toTopicShape()` explicit allowlist.

**ForumsService.listTopics** (new):
- Public read — no auth required.
- Same board visibility gate (oracle parity for nonexistent/gated → 404 + `TOPIC_NOT_FOUND_MESSAGE`).
- Filters `deletedAt IS NULL`.
- Deterministic order: `isPinned DESC, lastPostAt DESC, createdAt DESC`.
- Stable page contract: `page` 1-indexed (default 1), `pageSize` 1–100 (default 20), `total` always returned.

**ForumsService.TOPIC_NOT_FOUND_MESSAGE** (new constant):
- Shared constant `"Forum topic not found."` for oracle parity — both nonexistent and gated boards produce identical 404 message.

**toTopicShape()** (new private method):
- Explicit allowlist: `id, title, slug, body, isPinned, replyCount, lastPostAt, author{username, displayName}, createdAt, updatedAt`.
- Omits: `authorUserId` (internal FK), `boardId`, `isLocked`, `movedByUserId`, `movedAt`, `lockedByUserId`, `lockedAt`, `deletedAt`.

**ForumsController — two new routes:**
- `GET /forums/boards/:boardId/topics` — public paginated read, no auth required.
- `POST /forums/boards/:boardId/topics` — member-authenticated (401 before data op), 400 on invalid title/unsafe Markdown, 404 oracle-parity on non-readable/nonexistent board.

**forums.types.ts — new types:**
- `PublicAuthorShape`, `PublicTopicShape`, `PaginatedTopicsShape`, `CreateTopicInput`, `TopicListQuery`.

**forums.service.test.ts — P7 breadth update:**
- `makeForumsService` factory updated to accept and pass a 3rd `topicRepo` argument; all 6 inline `new ForumsService(...)` calls in `isBoardPubliclyReadable` tests updated to pass 4 arguments. This is required breadth maintenance (P7) — the test file was allowed per the coordinator's explicit P7 instruction.

## Security Notes

- Full board+topic visibility predicate re-checked via `isBoardPubliclyReadable` (which calls `evaluate()`) on every write and read path — no inline re-derived predicates.
- Oracle parity: nonexistent board and gated board both return `TOPIC_NOT_FOUND_MESSAGE` — no existence oracle.
- 401 check at controller layer before any service/DB operation on the create path.
- Markdown sanitized before any DB write: `normalizeMarkdownBody` then `validateMarkdownBody`; unsafe content throws 400 before `save()`.
- Public topic shape is an explicit allowlist — no entity passthrough.

## Expected Validation Failures Carried Forward

None.

## Artifact Files Written

- `artifacts/milestone-4-forums/ST4/implementer_result.json`
- `artifacts/milestone-4-forums/ST4/implementer_report.md`
- `artifacts/milestone-4-forums/ST4/tester_prompt.txt`
