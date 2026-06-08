# Implementer Report — ST4 (Remediation Pass 2)

**Status:** success
**Branch:** ms4-st4-implementer-20260608
**Code commit:** d0e8110

## Task Summary

Verifier-driven remediation pass 2 of max 2: fix two non-blocking WARNINGs raised by the first Verifier pass (originally from the Security CONDITIONAL PASS).

- WARNING 1 (code fix): `createTopic` called `normalizeMarkdownBody(input.body)` and `assertTopicTitleValid(input.title)` without guarding against missing/non-string inputs. Without a global ValidationPipe, a non-string `body` or `title` would reach `.trim()` / string methods and throw a TypeError -> HTTP 500 instead of the documented 400.
- WARNING 2 (tester instruction only): `deletedAt: IsNull()` soft-delete exclusion in `listTopics` is implemented but not directly test-asserted. Downstream Tester must add a non-vacuous assertion.

## Changed Files (this pass)

- `apps/api/src/forums/forums.service.ts` — added `typeof input.title !== "string"` and `typeof input.body !== "string"` guards before any string-method calls in `createTopic`; added `?? ""` to `normalizeMarkdownBody` call (blog precedent mirror). Board visibility gate ordering and sanitizer-before-persist order preserved unchanged. No security check weakened.

## Validation Commands Run

- `vitest run --root apps/api` (invoked as `node_modules/.bin/vitest run --root apps/api`) — PASS: 676 tests, 2 skipped (DB-gated integration), 0 failures
- `pnpm typecheck` — PASS: 0 errors
- `pnpm lint` — PASS: 0 warnings

Full vitest summary:
```
 Test Files  27 passed | 1 skipped (28)
      Tests  676 passed | 2 skipped (678)
   Start at  04:55:47
   Duration  3.56s
```

## Implementation Context

**Warning 1 fix — `createTopic` input type guards:**

Before the fix, `createTopic` relied entirely on TypeScript's compile-time types (`input: CreateTopicInput` with `title: string; body: string`). At runtime with no global ValidationPipe, a missing or non-string value from an HTTP request body would flow through unchanged. Specifically:
- `assertTopicTitleValid(undefined)` would pass `!title` check correctly and throw 400 — but a non-string truthy value (e.g. `{}`) would reach `title.trim()` and throw TypeError -> 500.
- `normalizeMarkdownBody(undefined)` or `normalizeMarkdownBody({})` would throw TypeError -> 500.

Fix: Added `typeof input.title !== "string"` guard that throws `BadRequestException("Topic title must not be empty.")` before `assertTopicTitleValid`. Added `typeof input.body !== "string"` guard that throws `BadRequestException("Topic body must be a string.")` before `normalizeMarkdownBody`. Added `?? ""` to `normalizeMarkdownBody(input.body ?? "")` to mirror the blog precedent.

The existing `assertTopicTitleValid` check for empty/whitespace title is preserved unchanged.
Board visibility gate remains first (before input validation, before sanitizer).
Sanitizer remains before persistence.

**Warning 2 — tester instruction only (no code change):**

The `deletedAt: IsNull()` predicate in `listTopics` is correctly implemented. The Tester is instructed to add a direct assertion that this condition is present in the repository query, so a regression dropping it would fail.

## Security Notes

- All security properties preserved. No check weakened.
- Type guards add a defense-in-depth layer that converts potential 500s to documented 400s.
- Oracle parity, visibility gate ordering, and sanitizer-before-persist order all unchanged.

## Forward Note — Anonymous Actor Predicate

The `isBoardPubliclyReadable` predicate uses an anonymous actor (no authenticated user context). This means members-only or project-scoped boards are not topic-creatable or topic-listable even by authenticated members. This is intentional and fail-closed for ST4. A later member-scoped-board subtask will re-evaluate the predicate with a real actor context. No change made to the predicate.

## Expected Validation Failures Carried Forward

None.

## Artifact Files Written

- `artifacts/milestone-4-forums/ST4/implementer_result.json`
- `artifacts/milestone-4-forums/ST4/implementer_report.md`
- `artifacts/milestone-4-forums/ST4/tester_prompt.txt`
