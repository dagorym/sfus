# Tester Report — ST-12: Landing Page Refresh to Milestone 5

## Status

PASS

## Task Summary

ST-12 rewrote the landing page (`apps/web/app/page.tsx`) from Milestone 4 to
Milestone 5 (Documents wiki), added a new `RecentDocActivity` component
(`apps/web/components/recent-doc-activity.tsx` and its CSS module), wired that
component into the What's New section, and added `/docs` explore links and a
wiki highlight card.

## Acceptance Criteria

| ID  | Description                                                                   | Result |
|-----|-------------------------------------------------------------------------------|--------|
| AC1 | Hero/highlights/what's-new/explore/scope copy describes MS5; no MS4 labels   | PASS   |
| AC2 | /docs explore link and wiki highlight are present                             | PASS   |
| AC3 | RecentDocActivity renders recent doc edits; loading/empty/error/populated     | PASS   |
| AC4 | `next build` and lint pass                                                    | PASS   |

## Test Files Modified

- `apps/web/app/public-shell.spec.ts` — updated (approved behavior change)
- `apps/web/components/recent-doc-activity.spec.ts` — new file

### Changes to public-shell.spec.ts

Rationale for update: the `keeps the homepage branded and static` test
previously asserted `expect(pageSource).toContain("Milestone 4")` because the
page described MS4. ST-12 replaced all MS4 page.tsx copy with MS5 copy, so the
positive Milestone 4 assertion became a false failure. Changed to:

- `expect(pageSource).toContain("Milestone 5")` (MS5 copy is present)
- `expect(pageSource).not.toContain("Milestone 4")` (no stale MS4 labels)
- Added: `/docs` link assertion, `Documents wiki` highlight, `RecentDocActivity`
  import and rendering assertions.

All other existing assertions were left unchanged. The `layout.tsx` assertions
about "Milestone 4 Content Platform" remain valid — `layout.tsx` was not part
of ST-12 scope.

## New Test File: recent-doc-activity.spec.ts

17 source-contract tests covering:

- `use client` directive (AC3)
- `getRecentDocEdits` and `DocsRecentEditShape` imports from `docs-client` (AC3)
- Loading state text (AC3)
- Empty state text and `edits.length === 0` guard (AC3)
- Non-fatal error state and `.catch()` / `setError` pattern (AC3)
- Error check precedes null-edits check ordering (AC3)
- `useState` and `useEffect` presence (AC3)
- `getRecentDocEdits(5)` call with limit (AC3)
- Link href uses `/docs/` prefix and `edit.path` (AC3)
- `key={edit.pageId}` on list items (AC3)
- Editor display-name / username fallback and null guard (AC3)
- `editedAt` date formatted with `toLocaleDateString` (AC3)
- No `dangerouslySetInnerHTML` (AC3)
- Browse the wiki link in page.tsx pointing to `/docs` (AC2)
- `docs-client` exports `DocsRecentEditShape` and `getRecentDocEdits` (AC3)
- `/docs/recent` endpoint used; no `credentials: "include"` on public call (AC3)
- `page.tsx` primary CTA "Browse the wiki" + wiki highlight order before forums (AC2)

## Execution Results

### Vitest

```
Test Files  23 passed (23)
     Tests  927 passed (927)
  Duration  1.16s
```

All new and updated tests passed. No existing tests broken.

### Lint

```
apps/web lint: Done    (0 warnings, 0 errors)
apps/api lint: Done
```

### Next Build

```
✓ Compiled successfully
✓ Generating static pages (24/24)
```

Build clean; no type errors.

## Test Commit

Commit hash: `3bb5474`
Branch: `ms5-st12-tester-20260611`

## Notes

- No implementation code was modified.
- Temporary commit message file (`commit_msg_tmp.txt`) was deleted before the
  artifact commit.
- No other byproducts remain in the worktree.
