Security Review Report

Scope reviewed:
- Milestone 4 subtask ST3 — leak-proof public read API for forum categories & boards (Risk R1, dominant P12 leak surface).
- apps/api/src/forums/forums.service.ts: listPublicCategories(), getPublicBoard(id), isBoardPubliclyReadable(board), toBoardShape(), BOARD_NOT_FOUND_MESSAGE, anonymousActor.
- apps/api/src/forums/forums.controller.ts: GET /forums/categories, GET /forums/boards/:id (public, unauthenticated).
- apps/api/src/forums/forums.types.ts: PublicCategoryShape, PublicBoardShape.
- Supporting cross-check: apps/api/src/authorization/authorization.service.ts evaluate(), forum-board.entity.ts, forums.module.ts, and the ST3 forums.service.test.ts / forums.controller.test.ts suites.

Why specialist review was triggered:
- Plan marks ST3 'Security review: required' as the dominant P12 surface (visibility filtering + oracle parity).
- Risk R1 (highest) — visibility/oracle leaks across new public read paths; the whole forum visibility model depends on ST3 not leaking project-scoped or non-readable boards.
- Retrospective P12 (existence oracles / partial visibility predicates) and P1 (doc/code drift) are the recurring failure classes for this work.

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md — ST3 (lines 182-199) and Risk R1 (lines 564-567).
- docs/features/authorization.md and docs/features/forums.md (public read routes + leak-prevention contract).
- docs/development/agent-retrospective-patterns.md — P1 (docs/code drift), P12 (visibility predicates and existence oracles).

Findings

BLOCKING
- None

WARNING
- None

NOTE
- None

Test sufficiency assessment:
- SUFFICIENT. Validation matrix run from this worktree is fully green: vitest run of src/forums/forums.controller.test.ts + src/forums/forums.service.test.ts = 124 tests passed (2 files); pnpm typecheck clean (apps/api + apps/web); pnpm lint clean (eslint --max-warnings=0).
- Leak coverage: listPublicCategories excludes scopeType='project' boards and visibility in {members, private, project-only}; includes site/public and site/unlisted. Exclusion asserted on BOTH the boards array and its length (no count leak — there is no separate count field to leak).
- Oracle parity: getPublicBoard asserts NotFoundException with message === ForumsService.BOARD_NOT_FOUND_MESSAGE for nonexistent, project-scoped, and members-visibility boards — proving identical class + message (no existence oracle). Controller test confirms the 404 propagates unchanged.
- evaluate() discipline: a spy asserts evaluate() is called for site boards and short-circuited (NOT called) for project-scoped boards; per-visibility outcomes pinned.
- Shape leakage: tests assert the public board shape has no scopeType, projectId, or categoryId property from both listPublicCategories and getPublicBoard.

Documentation / operational guidance assessment:
- SUFFICIENT. docs/features/forums.md was extended with a 'Public read API routes' section documenting the leak-prevention contract, oracle-parity guarantee, PublicBoardShape/PublicCategoryShape field tables, the explicit stripped-field list (scopeType, projectId, categoryId), and the route table.
- No P1 drift: every doc claim (8 PublicBoardShape fields, stripped internal fields, evaluate() routing, identical-message 404) matches the code and JSDoc/Swagger decorators on the controller handlers.

Artifacts written:
- artifacts/milestone-4-forums/ST3/security_report.md
- artifacts/milestone-4-forums/ST3/security_result.json

Outcome:
- PASS

---

## Detailed specialist analysis

Severity legend for this section: BLOCKING (blocks rollout), CONCERN (forward-on,
non-blocking), INFO (observation). This review produced **zero** findings at any
severity; every concern below resolves cleanly. Overall outcome: **PASS** (no leak,
oracle parity holds, evaluate() discipline intact, validation matrix green).

### Concern 1 — Visibility filtering (P12): PASS

- `isBoardPubliclyReadable(board)` (forums.service.ts:351-366) is the single
  gatekeeper. It first short-circuits to `false` when `board.scopeType !== "site"`,
  then routes the visibility decision through `AuthorizationService.evaluate()` with
  the anonymous actor and `action: "read"`. Both conditions must hold.
- The scope filter keys on **`scope_type`**, not `project_id` (which is a free,
  nullable, FK-less string — forward-scaffolding for M7/M8). A board with
  `scope_type='project'` is excluded even if `project_id` is null and visibility is
  `public`. This matches plan D4 and AC, and is the correct key.
- `listPublicCategories()` (forums.service.ts:393-415) applies `isBoardPubliclyReadable`
  as a `.filter()` over `category.boards` and maps only survivors via `toBoardShape`.
  Excluded boards appear in neither the `boards` array nor any aggregate: the
  `PublicCategoryShape` has **no count/length field**, so there is no derived count
  that could leak hidden boards. `boards.length` is computable only over the filtered
  list. No category-side back-reference re-exposes a hidden board, because the mapped
  category object carries only the filtered `boards` array (no `category.boards` entity
  relation passthrough).
- `getPublicBoard(id)` (forums.service.ts:429-435) re-applies the **same**
  `isBoardPubliclyReadable` predicate, so a hidden board is not reachable via the
  board-detail path either. The detail lookup uses `findOne({ where: { id } })` with no
  relations, so no nested relation can leak.
- Anonymous + `members`/`project-only`/`private` correctly denied: traced through
  evaluate() — for an anonymous actor (`userId: null`) these visibilities fall to the
  `!actor.userId` early-return (`authentication-required`, denied) before the
  authenticated `members`/`project-only` branches are reachable.

### Concern 2 — Oracle parity (P12): PASS

- `getPublicBoard` throws `new NotFoundException(ForumsService.BOARD_NOT_FOUND_MESSAGE)`
  for the nonexistent case and the hidden case through the **same** `if (!board ||
  !this.isBoardPubliclyReadable(board))` branch (forums.service.ts:431-432). Same
  exception class (404), same constant message, same response shape — no message,
  status, field, or control-flow divergence between "doesn't exist" and "exists but
  hidden". There is no early validation or distinct branch that could create a timing
  or message oracle.
- Tests assert **message identity**, not merely both-throw: oracle-parity cases assert
  `.rejects.toThrow(ForumsService.BOARD_NOT_FOUND_MESSAGE)` for nonexistent,
  project-scoped, and members-visibility boards (forums.service.test.ts:824-876). The
  controller test confirms the 404 + identical message propagate unchanged
  (forums.controller.test.ts:616-623).

### Concern 3 — evaluate() discipline: PASS

- Every visibility decision in the public path routes through
  `AuthorizationService.evaluate()` via the single `isBoardPubliclyReadable` helper.
  There are **no inline re-derived visibility predicates** anywhere in the ST3 surface
  (no `visibility === 'public'` string comparisons in service/controller; the only
  `visibility ===` checks live centrally in authorization.service.ts). The lone inline
  check in the helper is the `scope_type` gate, which is an orthogonal scoping
  dimension, not a re-derivation of the central read policy.
- The anonymous actor is correct and least-privilege: `anonymousActor = { userId:
  null, globalRole: "" }` (forums.service.ts:341). `hasGlobalRole("", ...)` returns
  false (empty-string guard), so the admin/moderator elevation branches in evaluate()
  cannot fire; `userId: null` blocks owner/ACL/members/project branches. Only the
  `visibility-open` branch (public/unlisted, read) can allow. It cannot accidentally
  grant elevated read.
- Discipline is operator-pinned by tests: a spy verifies `evaluate()` is invoked for
  site boards and short-circuited (not called) for project-scoped boards, with the
  per-visibility outcomes asserted (forums.service.test.ts:596-674).

### Concern 4 — Shape leakage: PASS

- `PublicBoardShape` / `PublicCategoryShape` (forums.types.ts:16-40) are explicit
  interfaces with no internal fields. `toBoardShape` (forums.service.ts:372-383) is an
  explicit field-by-field allowlist of 8 fields — it does **not** spread the entity and
  does not pass an entity instance through. `scopeType`, `projectId`, `categoryId`, and
  the `category`/`topics` relations on `ForumBoardEntity` are never copied into the DTO,
  so they cannot leak via serialization. The category mapping is likewise explicit and
  only embeds already-mapped board DTOs.
- No global `ClassSerializerInterceptor` is registered for this module, and it would be
  moot regardless since the handlers return plain mapped objects, not entity instances.
- Stripping is test-pinned from both public routes (forums.service.test.ts:787-814 and
  878-901): `expect(board).not.toHaveProperty("scopeType" | "projectId" | "categoryId")`.

### Concern 5 — Unlisted semantics: PASS

- `unlisted` is treated as publicly readable for read, by design. evaluate() allows
  `read` for `visibility === "public" || visibility === "unlisted"` (authorization.
  service.ts:54), consistent with the existing site-wide visibility contract and the
  plan's stated treatment of site/unlisted as guest-readable. This is intentional
  ("unlisted" = reachable but not advertised), not a leak of something meant to be
  hidden — the genuinely-hidden vocabularies (`members`, `project-only`, `private`) are
  all denied to the anonymous actor. The behavior is pinned: a site/unlisted board
  appears in the listing (forums.service.test.ts:765-785) and unlisted returns true via
  evaluate() (forums.service.test.ts:625-637).

## Validation matrix (commands actually run, from this worktree)

All commands were executed against the worktree
`/home/tstephen/repos/worktrees/ms4-st3-security-20260608` after
`pnpm --dir <worktree> install --frozen-lockfile` (lockfile up to date).

1. `pnpm --dir <worktree>/apps/api exec vitest run src/forums/forums.controller.test.ts
   src/forums/forums.service.test.ts`
   → **2 files passed, 124 tests passed** (controller 54, service 70). 0 failed.
2. `pnpm --dir <worktree> typecheck` (tsc --noEmit, apps/api + apps/web)
   → **clean** (both "Done", no errors).
3. `pnpm --dir <worktree> lint` (eslint, `--max-warnings=0`, apps/api + apps/web)
   → **clean** (both "Done", 0 warnings/errors).

No prior-subtask failing-test regression was observed: the matrix is fully green, so
the "report it as a finding if the matrix does NOT pass" condition does not apply.

## Conclusion

The ST3 public read API is leak-proof against the R1 / P12 threat model: project-scoped
and non-readable boards are absent from the listing, its (nonexistent) counts, and the
board-detail path; the board-detail 404 is byte-identical for hidden vs nonexistent;
every visibility decision routes through a correctly-scoped anonymous `evaluate()`; the
public shapes strip all internal fields; and `unlisted` read-exposure is intentional and
consistent with the central policy. Tests assert message identity and predicate routing
(not just both-throw), and the full validation matrix is green. **Outcome: PASS** — no
blocking findings, no concerns to forward.
