# Tester Report — ST4: Topics (create, paginated read, visibility, pinned ordering)

## Status: PASS

All 14 required test cases added and passing. 0 typecheck errors. 0 lint errors.

## Testing Scope

Subtask ST4 — `POST /forums/boards/:boardId/topics` and `GET /forums/boards/:boardId/topics`

Implementation commit: b73d475 on branch `ms4-st4-implementer-20260608`

Changed files under test:
- `apps/api/src/forums/forums.controller.ts`
- `apps/api/src/forums/forums.service.ts`
- `apps/api/src/forums/forums.types.ts`

## Test Files Modified

- `apps/api/src/forums/forums.service.test.ts` (+13 new test cases in 2 new describe blocks)
- `apps/api/src/forums/forums.controller.test.ts` (+3 new test cases in 2 new describe blocks + stub updates)

Test commit: 080b3f7

## Test Results

```
Test Files  27 passed | 1 skipped (28)
     Tests  676 passed | 2 skipped (678)
  Start at  04:34:59
  Duration  3.56s (transform 2.61s, setup 0ms, collect 13.77s, tests 3.01s, environment 7ms, prepare 3.47s)
```

Forums-specific results:
- `src/forums/forums.service.test.ts`: 83 tests passed (70 pre-existing + 13 new ST4)
- `src/forums/forums.controller.test.ts`: 57 tests passed (54 pre-existing + 3 new ST4)

## Acceptance Criteria Coverage

| # | Criterion | Test Case | Result |
|---|-----------|-----------|--------|
| TC1 | createTopic nonexistent board → NotFoundException with TOPIC_NOT_FOUND_MESSAGE | ForumsService.createTopic (ST4) > throws NotFoundException with TOPIC_NOT_FOUND_MESSAGE for nonexistent board | PASS |
| TC2 | createTopic gated board → IDENTICAL TOPIC_NOT_FOUND_MESSAGE (oracle parity) | ForumsService.createTopic (ST4) > throws NotFoundException with IDENTICAL TOPIC_NOT_FOUND_MESSAGE for members-visibility board | PASS |
| TC3 | listTopics nonexistent board → TOPIC_NOT_FOUND_MESSAGE | ForumsService.listTopics (ST4) > throws NotFoundException with TOPIC_NOT_FOUND_MESSAGE for nonexistent board | PASS |
| TC4 | listTopics gated board → IDENTICAL TOPIC_NOT_FOUND_MESSAGE | ForumsService.listTopics (ST4) > throws IDENTICAL TOPIC_NOT_FOUND_MESSAGE for gated board | PASS |
| TC5 | createTopic on readable board calls AuthorizationService.evaluate() | ForumsService.createTopic (ST4) > calls AuthorizationService.evaluate() when board is readable | PASS |
| TC6 | listTopics on readable board calls evaluate() | ForumsService.listTopics (ST4) > calls AuthorizationService.evaluate() when board is readable | PASS |
| TC7 | Unsafe Markdown: `<script>` body → BadRequestException (400), save NOT called | ForumsService.createTopic (ST4) > rejects <script> body with BadRequestException before persistence | PASS |
| TC8 | Unsafe Markdown: `javascript:` link body → 400 before persistence | ForumsService.createTopic (ST4) > rejects javascript: link body with BadRequestException before persistence | PASS |
| TC9 | Pinned ordering: findAndCount called with order {isPinned:'DESC', lastPostAt:'DESC', createdAt:'DESC'} | ForumsService.listTopics (ST4) > passes correct pinned+activity order to findAndCount | PASS |
| TC10 | Public shape: response lacks authorUserId, boardId, isLocked, movedByUserId, lockedByUserId, deletedAt; has author.username, author.displayName | ForumsService.createTopic (ST4) > response shape lacks internal fields and includes author.username/displayName | PASS |
| TC11 | Public shape on listTopics same field-stripping | ForumsService.listTopics (ST4) > returned topic shapes lack internal fields and include author.username/displayName | PASS |
| TC12 | Pagination: page=2, pageSize=5 → skip=5, take=5 | ForumsService.listTopics (ST4) > translates page=2, pageSize=5 into skip=5, take=5 | PASS |
| TC13 | Pagination clamping: pageSize=999 → clamped to 100 | ForumsService.listTopics (ST4) > clamps pageSize=999 to 100 | PASS |
| TC14 | Controller 401 gate: resolveSession rejection → UnauthorizedException BEFORE any service call | ForumsController: createTopic — 401 gate fires before any service call > throws UnauthorizedException and does NOT call forumsService | PASS |

## Typecheck

```
apps/api typecheck: Done
apps/web typecheck: Done
```
0 errors.

## Lint

```
apps/api lint: Done
apps/web lint: Done
```
0 warnings.

## Notes

- Added `findAndCount` to the `MinimalRepo` stub interface to support `listTopics` tests that need to mock `topicRepository.findAndCount`.
- TC2 and TC4 double-assert oracle parity: both gated and nonexistent boards produce the exact same message string.
- TC5 and TC6 use `vi.spyOn(authorizationService, 'evaluate')` with a real `AuthorizationService` instance injected into `ForumsService`.
- No implementation code was modified.
- No temporary byproducts to clean up.
