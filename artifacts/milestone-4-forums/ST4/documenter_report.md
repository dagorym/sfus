# Documenter Report — ST4: Forum Topics (create + paginated read)

## Status: PASS

Documentation updated. All required ST4 documentation impact items addressed.

## Documentation Updated

**File:** `docs/features/forums.md`

### Changes made

1. **Overview** — Extended the hierarchy description to include Topics as the third level (below Category and Board).

2. **Public read routes table** — Added rows for both topic routes (`GET /forums/boards/:boardId/topics` and `POST /forums/boards/:boardId/topics`) to the existing public-routes table.

3. **New "Topic routes (ST4)" section** — Added a complete section covering:
   - Member-authenticated topic creation (`POST /forums/boards/:boardId/topics`)
     - Request body shape
     - Validation and security order (session → board gate → title → Markdown normalize → Markdown validate → persist)
     - Full error contract table (400 / 401 / 404)
   - Public paginated topic list (`GET /forums/boards/:boardId/topics`)
     - Query parameters (`page`, `pageSize`) with defaults and clamping constraints
     - Deterministic sort order (isPinned DESC, lastPostAt DESC, createdAt DESC)
     - `PaginatedTopicsShape` response structure
     - Error contract table (404)
   - Response shapes: `PublicAuthorShape` and `PublicTopicShape` with stripped internal fields
   - Oracle parity contract for topic routes (P12) — `TOPIC_NOT_FOUND_MESSAGE` uniform for gated/nonexistent boards
   - Markdown safety contract (normalize → validate → reject with 400 before persistence)

4. **Planned extensions** — Updated from `ST4–ST6` to `ST5` and `ST6` only, since ST4 is now implemented.

## Acceptance Criteria Coverage

| AC | Requirement | Status |
|----|-------------|--------|
| P1 | Real status contract documented (401/400/404 per route) | PASS |
| P12 | Oracle parity documented for topic routes (TOPIC_NOT_FOUND_MESSAGE, identical for gated/nonexistent) | PASS |
| — | POST /forums/boards/:boardId/topics documented (member-auth, 401, Markdown 400, board 404) | PASS |
| — | GET /forums/boards/:boardId/topics documented (public paginated read) | PASS |
| — | Pagination contract documented (deterministic order, page/pageSize, clamping to 100, stable page shape) | PASS |
| — | PublicTopicShape documented (author.username/displayName only; internal fields listed as stripped) | PASS |
| — | Consistent with existing admin + public-read sections | PASS |

## Notes

- No changes to `docs/deferred-tasks.md` (per plan constraint).
- ST4 documentation is consistent with the patterns established by ST2 (admin) and ST3 (public board read).
- ST5 (posts) and ST6 (moderation) will extend the topic routes section further.
