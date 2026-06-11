# ST2 Tester Report — Topic last-reply author + primitive (API)

## Summary

**Status:** PASS — all acceptance criteria verified.
**Test file:** `apps/api/src/forums/forums.service.test.ts`
**Total tests in file:** 150 (118 pre-existing + 32 new ST2 tests)
**New tests added:** 32
**Test commit:** `9a7be90eef70d92bc766b89c3e5f7e922b8086c6`

---

## Acceptance Criteria Coverage

### AC1: `lastPostAuthor: { username, displayName } | null` present on topic items
- **ST2-AC1-field-present**: `listTopics` response includes `lastPostAuthor` field on each topic item. PASS
- **ST2-AC1-shape**: `lastPostAuthor` includes `username` and `displayName` fields when non-null. PASS

### AC2: `lastPostAuthor` = author of most recent non-deleted reply when replies exist
- **ST2-AC2-single-reply**: single non-deleted reply returns that reply's author. PASS
- **ST2-AC2-multiple-topics**: correct per-topic last-reply author for multiple topics in one query. PASS
- **ST2-AC2-listTopics-nonnull**: `listTopics` returns non-null `lastPostAuthor` matching the reply author. PASS

### AC3: `lastPostAuthor` is `null` when no non-deleted replies exist
- **ST2-AC3-no-replies-method**: `resolveTopicLastActivityAuthors` returns null for topic with no rows. PASS
- **ST2-AC3-all-soft-deleted**: returns null when all replies are soft-deleted (query returns no rows). PASS
- **ST2-AC3-listTopics-null**: `listTopics` returns `null` `lastPostAuthor` when no replies exist. PASS
- **ST2-AC3-empty-page**: empty topic page returns zero topics without crashing. PASS

### AC4: Soft-deleted posts are ignored
- **ST2-AC4-sql-filter**: `andWhere` call contains `deleted_at IS NULL` to exclude soft-deleted posts. PASS
- **ST2-AC4-listTopics-soft-deleted**: `lastPostAuthor` is null when latest reply is soft-deleted. PASS

### AC5: `resolveTopicLastActivityAuthors` method exists with correct signature
- **ST2-AC5-method-exists**: method exists on `ForumsService` and is callable. PASS
- **ST2-AC5-empty-input**: empty `topicIds` returns empty `Map` immediately without DB call. PASS
- **ST2-AC5-mixed**: mixed map (some with replies, some without) returns correct null/non-null mix. PASS

### AC6: Board visibility oracle parity unchanged
- **ST2-AC6-nonexistent**: nonexistent board returns 404 with `TOPIC_NOT_FOUND_MESSAGE`. PASS
- **ST2-AC6-gated-members**: gated board (members) returns identical `TOPIC_NOT_FOUND_MESSAGE`. PASS

---

## Edge Cases Covered

| Edge Case | Test | Result |
|---|---|---|
| Topic with non-deleted replies | `lastPostAuthor` = reply author | PASS |
| Latest reply soft-deleted, earlier reply exists | SQL filter excludes soft-deleted; earlier author returned | PASS (via `andWhere deleted_at IS NULL` assertion) |
| All replies soft-deleted | `lastPostAuthor` is null | PASS |
| No replies at all | `lastPostAuthor` is null | PASS |
| Empty page (no topics) | No crash, empty array | PASS |
| Nonexistent board ID | 404 with `TOPIC_NOT_FOUND_MESSAGE` | PASS |
| Gated board (members visibility) | 404 with identical message | PASS |

---

## Test Commands

```
npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run src/forums/forums.service.test.ts
npx --yes pnpm@10.0.0 typecheck
npx --yes pnpm@10.0.0 lint
```

All three commands passed with zero errors or warnings.

---

## Implementation Files Audited (not modified)

- `apps/api/src/forums/forums.types.ts` — `PublicTopicShape.lastPostAuthor: PublicAuthorShape | null` confirmed.
- `apps/api/src/forums/forums.service.ts` — `resolveTopicLastActivityAuthors`, `toTopicShape` second param, `listTopics` call chain confirmed.

---

## No product code was modified. All changes are confined to the test file.
