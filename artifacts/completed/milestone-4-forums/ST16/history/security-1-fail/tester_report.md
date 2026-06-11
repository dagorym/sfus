# Tester Report — ST16 Web Forum Browsing, Authoring, Mentions, Moderation

## Status

PASS

## Branch

`ms4-st16-tester-20260608`

## Test Commit

`d0a9080`

## Scope

Milestone 4, Subtask ST16 — web layer for forum browsing, topic/reply authoring, @-mention autocomplete, and moderator controls.

## Implementation Files Confirmed

All required implementation files were present on the implementer branch:

- `apps/web/app/forums/page.tsx` — forum category/board index
- `apps/web/app/forums/[boardSlug]/page.tsx` — board view, paginated topics
- `apps/web/app/forums/[boardSlug]/[topicSlug]/page.tsx` — topic view, paginated posts, reply form, moderator controls
- `apps/web/app/forums/[boardSlug]/new-topic/page.tsx` — create-topic form
- `apps/web/app/forums/forums-client.ts` — API client (public read, member write, moderation, suggest)
- `apps/web/components/mention-autocomplete.tsx` — @username autocomplete
- `apps/web/app/forums/forums.module.css` — forum styles
- `apps/web/components/mention-autocomplete.module.css` — autocomplete styles

## Test Files Written

- `apps/web/app/forums/forums.spec.ts` (new) — 51 tests across 10 describe blocks
- `apps/web/components/mention-autocomplete.spec.ts` (new) — 24 tests across 5 describe blocks

## Test Commands Run

```
npx vitest run --root apps/web
pnpm typecheck
pnpm lint
```

## Results

### vitest

```
Test Files  10 passed (10)
      Tests  368 passed (368)
   Start at  09:07:33
   Duration  595ms
```

New specs confirmed to execute:
- `app/forums/forums.spec.ts` — 51 tests PASS
- `components/mention-autocomplete.spec.ts` — 24 tests PASS

### typecheck

```
apps/api typecheck: Done
apps/web typecheck: Done
```

0 errors.

### lint

```
apps/web lint: Done
apps/api lint: Done
```

0 errors, 0 warnings.

## Acceptance Criteria Coverage

| AC | Description | Test Coverage | Result |
|----|-------------|---------------|--------|
| AC1 | Forum index renders ONLY site boards (public read API; project-scoped boards never appear) | `forums-client.ts` public read contracts; index page calls `listCategories` only; board links use slug not UUID; MarkdownRenderer strips raw HTML and rejects JS/data URIs | PASS |
| AC2 | Members create topics/replies; guests see sign-in affordance preserving ?next= (points back at forum URL) | Board view and topic view sign-in link tests; `?next=` encoding assertions; new-topic page `resolveProtectedSession` guard | PASS |
| AC3 | Locked topic hides reply form and shows lock notice | `isLocked` conditional gate; `lockedNotice` presence; "No new replies can be posted" message | PASS |
| AC4 | Moderator controls (pin/lock/move) render for moderator/admin; DO NOT render for regular member (both directions) | `isModerator ?` conditional; `moderationBar` inside the gate; ST6 API functions called; `hasGlobalRole("moderator")` used | PASS |
| AC5 | @-autocomplete queries suggest endpoint; inserting result puts handle in editor; @username renders as /users/<username> link (encoded) | `suggestUsers` import from forums-client; `debouncedFetch(fragment)`; `insertSuggestion` builds `@username `; `/users/${encodeURIComponent(...)}` links; no dangerouslySetInnerHTML in component | PASS |

## Key Findings

- **AC1 XSS/sanitization**: `MarkdownRenderer.stripRawHtml` removes all `<...>` tags; `sanitizeUrl` rejects `javascript:`, `data:`, and any non-http(s)/relative scheme. Post bodies pass through `<MarkdownRenderer content={post.body}>` — no raw `dangerouslySetInnerHTML` on user input in any forum page.
- **AC1 site-only boards**: The index and board pages use only `listCategories` (the public read API that already filters to site-scoped boards). No direct admin board listing or project-scoped board API is called.
- **AC2 ?next= preservation**: The board view encodes `encodeURIComponent(\`${currentPath}/new-topic\`)` as the `next` parameter; the topic view encodes `encodeURIComponent(currentPath)`.
- **AC3 locked topic**: The topic view checks `isLocked` first — when true it renders `<lockedNotice>` and skips both the session check and the reply form entirely.
- **AC4 both directions**: The test confirms `isModerator ?` gates the `moderationBar`, and `hasGlobalRole(session.user, "moderator")` drives `isModerator`. A regular member session evaluates `isModerator` to `false` so the entire bar is absent.
- **AC5 insertion**: `insertSuggestion` builds `\`${before}@${item.username} ${after}\`` (plain text, no HTML) and replaces only the @fragment from `mentionStartRef` to the cursor.

## Assumptions

- Test framework: vitest (source-audit pattern), consistent with all existing web specs in this workspace. No jsdom / @testing-library/react is available, so DOM rendering tests were not feasible.
- Test file locations inferred from repository convention: spec files colocated with the implementation files they test.
- Shared artifact directory treated as repository-root-relative: `artifacts/milestone-4-forums/ST16`.

## Cleanup

No temporary non-handoff byproducts were created. The two spec files are committed as handoff artifacts.
