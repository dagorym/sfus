# Tester Report — ST5: Per-board Topics/Posts/Last Post columns (web)

## Status

PASS — all acceptance criteria validated; 51 tests pass (39 existing + 12 new).

## Testing Scope

**Task:** ST5 — Add per-board Topics/Posts/Last Post columns to the public /forums index page.

**Implementation surface:**
- `apps/web/app/forums/forums-client.ts` — `BoardLastPostShape`, `PublicBoardShape` extensions
- `apps/web/app/forums/page.tsx` — semantic table with Board/Topics/Posts/Last Post columns
- `apps/web/app/forums/forums.module.css` — CSS class additions (not directly tested)

**Test file:** `apps/web/app/forums/forums.spec.ts`

**Test method:** Source-audit pattern (file-read + string assertions), consistent with established convention in this workspace. The page.tsx is a "use client" component; no DOM environment is available.

**Artifact directory:** `artifacts/forums-listing-enhancements-and-fixes/ST5`

## Acceptance Criteria Validation

| Criterion | Description | Result |
|-----------|-------------|--------|
| AC-ST5-1 | `BoardLastPostShape` has `at: string` + `author { username; displayName | null }` | PASS |
| AC-ST5-2 | `PublicBoardShape` gains `topicCount`, `postCount`, `lastPost` fields | PASS |
| AC-ST5-3 | `topicCount` and `postCount` rendered directly from board shape (no client recompute) | PASS |
| AC-ST5-4 | Last Post date rendered via `toLocaleDateString` on `board.lastPost.at` | PASS |
| AC-ST5-5 | Last Post author renders `displayName ?? username` | PASS |
| AC-ST5-6 | Last Post author link targets `/users/${encodeURIComponent(board.lastPost.author.username)}` | PASS |
| AC-ST5-7 | `encodeURIComponent` used for last-post author link (special-character username safety) | PASS |
| AC-ST5-8 | "No posts yet" shown when `board.lastPost === null` | PASS |
| AC-ST5-9 | Semantic `<table>` with Board/Topics/Posts/Last Post `<thead>` headers | PASS |
| AC-ST5-10 | No `dangerouslySetInnerHTML` in forums index page | PASS |

## New Test Coverage Added

Two new describe blocks appended to `apps/web/app/forums/forums.spec.ts`:

**"forums-client.ts — ST5 per-board aggregate shape"** (2 tests):
- `BoardLastPostShape` declares `at`, `username`, `displayName | null`
- `PublicBoardShape` includes `topicCount`, `postCount`, `lastPost`

**"Forums index page (app/forums/page.tsx) ST5 per-board column rendering"** (10 tests):
- `board.topicCount` rendered directly
- `board.postCount` rendered directly
- Last Post date via `toLocaleDateString` + `board.lastPost.at`
- `displayName ?? username` display precedence
- Author link targets `/users/${encodeURIComponent(board.lastPost.author.username)}`
- `encodeURIComponent` usage in lastPost author context
- `board.lastPost === null` check + "No posts yet" text
- Semantic `<table>` with all four column headers
- No `dangerouslySetInnerHTML`

## Validation Commands

### Web suite (forums spec only)
```
npx --yes pnpm@10.0.0 --filter "@sfus/web" exec vitest run app/forums/forums.spec.ts
```
Result: 51 tests passed (1 file), 0 failures.

### Lint
```
npx --yes pnpm@10.0.0 lint
```
Result: PASS — 0 warnings, 0 errors across all workspace apps.

### Typecheck
```
npx --yes pnpm@10.0.0 typecheck
```
Result: PASS — 0 errors across all workspace apps.

## Test Commit

Hash: `897bd90ae8a6098bd9cc1ce3489fdf6cf9050ac7`

## Files Changed

- `apps/web/app/forums/forums.spec.ts` — 95 lines added (12 new tests in 2 new describe blocks)

## Implementation Defects

None found. All acceptance criteria are met by the implementation as delivered.

## Cleanup

No temporary non-handoff byproducts were created.
