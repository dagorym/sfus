# Deferred-Tasks Cleanup Plan

- **Plan name:** `deferred-cleanup`
- **Coordination branch (suggested):** `plan/deferred-cleanup`
- **Artifact root:** `artifacts/deferred-cleanup/`
- **Date:** 2026-06-07
- **Source register:** `docs/deferred-tasks.md` (line references below are to its pre-cleanup state on `main` @ 1b99db5)

## Output Artifact Path

`plans/deferred-cleanup-plan.md`

## Overview

A robustness cleanup cycle that closes every actionable entry in the deferred-tasks
register that is not slated for a future milestone. Three planner-level outcomes were
produced this cycle:

1. **Verification** — every register entry was re-verified against `main`; all remain
   substantively open (none silently fixed), so no entries were removed for obsolescence.
2. **Register annotation** — entries owned by Milestones 4+ are marked with bold
   `Slated:` prefixes; design-doc features with no assigned milestone get
   `suggested milestone` annotations; conditional/watch/ops entries are marked as such.
   These edits are made by the planner in this planning cycle (the register is editable
   only during planning cycles).
3. **This plan** — ten implementation subtasks fixing all remaining open items.

## Confirmed Repository Facts (verified this cycle)

- No trusted-proxy configuration exists in the API bootstrap despite the MS1
  foundation-decisions doc (the single file under `docs/architecture/`, line 117) and
  `docs/operations/deployment.md:94` describing it as configured.
- No security-header/CSP configuration exists in `apps/web/next.config.mjs` or the API
  bootstrap; `helmet` is not a dependency anywhere in the workspace.
- Public comment serialization (`toCommentDetail`, `apps/api/src/blog/blog.controller.ts:498-524`)
  exposes `authorUserId`, `moderatedByUserId`, `moderatedAt`; no web component renders any
  of them (type declarations only, `apps/web/app/blog/blog-client.ts:33,220-225`).
- Distinct post-visibility-gate 400 messages remain at `blog.service.ts:399,402`
  (parentId) and `blog.service.ts:415,418` (imageId scope).
- `deriveUniqueSlug` (`blog.service.ts:555-575`) has no duplicate-key retry; a losing
  concurrent create surfaces an unhandled 500 at the `save` (`blog.service.ts:202`).
- `pages.service.ts:172,237,310` persist `featuredMediaId` unvalidated;
  `standalone-page.entity.ts:31` has no relation decorator for `currentRevisionId`;
  `pages.controller.ts:218` `resolveCurrentBody` is dead code.
- There is no public list-published-pages API endpoint (only `@Get(":slug")`), and no
  `apps/web/app/pages/page.tsx` index route — the bare-`/pages` dead link stands.
- `validateUrl` (`navigation.service.ts:278-285`) checks only non-empty + length ≤ 512;
  no leading-`/` rule for internal items.
- `navigation.service.test.ts:635-637` pins the publication predicate's operator as an
  object but not its `lessThanOrEqual` type (blog pins the type at
  `blog.service.test.ts:207-209`).
- Sanitizer patterns `/on\w+\s*=/i` and `/data\s*:/i`
  (`apps/api/src/media/markdown-sanitizer.ts:21,33`) remain context-free;
  `const { memoryStorage } = multer;` sits inside the import block
  (`media.controller.ts:19`).
- Register/login error-mapping helpers are unexported module-level functions
  (`apps/web/app/register/page.tsx:34,49`); only source-contract specs cover them, and the
  `statusCode === null` branch (`register/page.tsx:65`) is unpinned
  (`public-shell.spec.ts:157`).
- `cicd/tests/run-validations.sh:308` asserts `^DB_HOST=mysql$` in
  `apps/api/.env.example`, which ships `DB_HOST=127.0.0.1` (line 44) — the contract test
  fails on `main`.
- Reserved-slug tests on both sides iterate all eleven entries but pin neither
  cardinality nor set equality (`apps/api/src/pages/pages.service.test.ts:558-566`,
  `apps/web/app/pages/pages.spec.ts:310-313`).
- The media subsystem has no standalone specialist `security_report.md`; the
  ms3-completion final review accepted verifier-stage assessments instead.

## Assumptions (labeled)

- **Assumed:** the API workspace exposes a `build` script (`pnpm --filter @sfus/api build`)
  per `docs/development/workspace.md`; implementers confirm the exact command there.
- **Assumed:** admin moderation surfaces (if any consume `toCommentDetail`) are
  discoverable by enumerating its call sites; the implementer must verify before
  splitting serializers.
- **Assumed:** the Swagger UI mount status for the API is discoverable from the bootstrap;
  subtask-2 handles both mounted and unmounted cases explicitly.

## Decisions Resolved With the User (2026-06-07)

1. **Register format:** mapped items get bold `Slated: Milestone N (name)` prefixes;
   unmapped design-doc features get `suggested milestone` annotations; flat list retained.
2. **Media retroactive security review:** kept — folded into subtask-8, whose specialist
   Security stage must review the entire media subsystem.
3. **Security headers:** app-level enforcement — Next.js `headers()` for web + `helmet`
   on the API (Swagger exception documented); HSTS stays at the proxy per design §14;
   compatible-baseline CSP, enforced immediately (not Report-Only).
4. **Scope:** `/pages` index route and the test-strengthening set (register lines 7, 24,
   28, 30, 36, 38, 39) are IN scope. Nav publication-lookup batching (line 21) and the
   one-time ops slug check (line 25) stay deferred, clearly marked.

## Out of Scope (stays in the register)

- Future-milestone features (lines 5, 6, 8–18) — marked `Slated:`/`suggested milestone`.
- Nav batching (line 21, conditional perf), ops slug check (line 25, operational action),
  rollback-proof watch (line 27), pages/nav lockstep watch (line 37), the no-action
  decision record (line 40).

## Subtasks

Stable IDs `subtask-1` … `subtask-10`. Default Coordinator stage chain
(Implementer → Tester → Documenter → Verifier, + Security where marked, + final Reviewer)
applies; no stage-workflow subtasks are defined.

### subtask-1 — API trusted-proxy configuration

- **Register items closed:** line 3.
- **Security review required: yes** (trust boundary; forwarded-header handling).
- **Scope:** implement the locked trusted-proxy contract exactly as described in the MS1
  foundation-decisions doc (the single file under `docs/architecture/`, line 117) and
  `docs/operations/deployment.md:94` — configure Express `trust proxy` on the Nest HTTP
  adapter for exactly one trusted hop (the shared nginx-proxy), so `request.ip` and
  `X-Forwarded-Proto` resolve from forwarded headers in the proxied topology.
- **Likely files:** `apps/api/src/index.ts`; `apps/api/src/config/environment.ts` +
  `config.constants.ts` only if the documented contract requires an env-driven toggle.
- **Acceptance criteria:**
  1. The app sets `trust proxy` for a single trusted hop, matching the documented
     contract (cite the doc lines in code comments).
  2. Behind one simulated proxy hop, `request.ip` resolves the original client IP from
     `X-Forwarded-For` (provable by an executed test, not source inspection).
  3. All auth audit-log call sites recording `request.ip` (implementer greps and states
     the count; register says ~9) receive the forwarded client IP with zero call-site
     changes.
  4. Direct (un-proxied) local dev and the smoke validation flow still work unchanged.
  5. JSDoc/comments updated in the same commit; no stale "not configured" claims remain
     in code.
- **Documentation Impact:** `docs/operations/deployment.md` (claim becomes true; refresh
  wording), `docs/features/auth.md` (audit-log IP semantics), `docs/operations/launch.md`
  only if an env var is introduced.

### subtask-2 — Baseline security headers and CSP (app-level)

- **Register items closed:** line 4.
- **Security review required: yes** (site-wide header policy).
- **Depends on:** subtask-1 (same bootstrap file).
- **Scope:** add the locked baseline header policy at the app level.
  Web (`next.config.mjs` `headers()`, all routes): enforced compatible-baseline CSP
  (`default-src 'self'`; `script-src` with only the allowances Next.js actually requires,
  each justified by an in-code comment; `img-src`/`connect-src` derived from the existing
  API-base env contract in `docs/operations/launch.md` so hybrid dev — web :3000 / API
  :3001 — still works; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`),
  plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Frame-Options: DENY`, and a minimal `Permissions-Policy`. API: add `helmet` with
  JSON-API-appropriate defaults. **No HSTS at app level** (proxy-owned per design §14).
  If Swagger UI is mounted, configure and document its exception; if not mounted, record
  that no exception is needed.
- **Likely files:** `apps/web/next.config.mjs`, `apps/api/src/index.ts`,
  `apps/api/package.json`, `pnpm-lock.yaml`.
- **Acceptance criteria:**
  1. Every web route responds with the full baseline header set; CSP is enforced
     (`Content-Security-Policy`, not `-Report-Only`).
  2. Every API route responds with the helmet baseline minus HSTS.
  3. Core flows (landing, login, register, blog read, admin authoring, image upload)
     work with zero CSP violations in both hybrid-dev and full-stack modes; the smoke
     validation passes.
  4. Each CSP allowance beyond `'self'` carries an in-code justification comment.
  5. No `Strict-Transport-Security` header is emitted by either app.
- **Documentation Impact:** `docs/features/web-shell.md` (header contract),
  `docs/operations/deployment.md` (enforcement-point statement),
  `docs/development/api-conventions.md` (API middleware note).

### subtask-3 — Blog comment payload trim and oracle normalization

- **Register items closed:** lines 20, 23; tester guidance closes lines 28, 30.
- **Security review required: yes** (data minimization + existence-oracle removal).
- **Scope:** (a) drop `authorUserId`, `moderatedByUserId`, `moderatedAt` from PUBLIC
  comment responses (list + create). Enumerate every `toCommentDetail` call site first;
  if any admin/moderation surface consumes the same serializer, split into public vs
  admin serializers so admin capability is unchanged. Update the web mirror types
  (`blog-client.ts`) in the same change — both sides of the API/web mirror.
  (b) Normalize the post-visibility-gate distinguishers to uniform messages: one message
  for both parentId failures (`blog.service.ts:399,402`), one for both imageId failures
  (`blog.service.ts:415,418`); uniform responses must not distinguish
  exists-but-foreign from nonexistent. (c) Update Swagger decorators and JSDoc in the
  same commit.
- **Likely files:** `apps/api/src/blog/blog.controller.ts`,
  `apps/api/src/blog/blog.service.ts`, `apps/web/app/blog/blog-client.ts`.
- **Acceptance criteria:**
  1. Public comment payloads contain none of the three trimmed fields (provable by
     executed serializer tests).
  2. Admin/moderation behavior is unchanged; the implementer's report states which
     endpoints (if any) are admin-facing and how their data needs were preserved.
  3. parentId rejections return a single uniform status + message for not-found and
     wrong-post; imageId rejections likewise for nonexistent and wrong-scope.
  4. Swagger response models and JSDoc match the new payloads (stale decorator = defect).
  5. Zero references to the trimmed fields remain anywhere in `apps/web` (absence check).
- **Documentation Impact:** `docs/features/blog.md` (comment payload contract, error
  message contract).

### subtask-4 — Blog slug TOCTOU hardening

- **Register items closed:** line 19.
- **Security review required: no.**
- **Depends on:** subtask-3 (same files).
- **Scope:** make slug persistence concurrency-safe: catch the MySQL duplicate-key error
  (`ER_DUP_ENTRY`) on save in `create` and in every other write path that persists a
  `deriveUniqueSlug` result (enumerate the call sites; state the count), retry derivation
  with an incremented suffix, bounded attempts (3), then a controlled error-envelope
  response (409-class) instead of an unhandled 500.
- **Likely files:** `apps/api/src/blog/blog.service.ts`.
- **Acceptance criteria:**
  1. A save rejected with a duplicate-key error retries derivation and succeeds with a
     suffixed slug (driven by an executed unit test mocking a rejection-then-success
     save sequence).
  2. Retry attempts are bounded; exhaustion returns a controlled error envelope, never a
     raw 500.
  3. Every `deriveUniqueSlug`-consuming write path is covered; the count is stated.
  4. JSDoc on the affected methods reflects the retry semantics.
- **Documentation Impact:** `docs/features/blog.md` (slug-collision behavior note).

### subtask-5 — Pages module robustness

- **Register items closed:** lines 31, 33, 34; tester guidance closes the API half of
  line 38.
- **Security review required: no.**
- **Scope:** (a) validate `featuredMediaId` on create/update/restore (3 sites:
  `pages.service.ts:172,237,310`), mirroring the semantics of blog's
  `assertFeaturedImageExists` (`blog.service.ts:521-524`) including any scope checks it
  performs. (b) Add the missing relation decorator for
  `StandalonePageEntity.currentRevisionId` (`standalone-page.entity.ts:31`) so the ORM
  can load the current revision via relations — without schema change: the FK already
  exists in migration `1748736000000`; configure the relation so no duplicate FK or new
  migration is generated and existing queries keep working. (c) Delete the dead
  `resolveCurrentBody` (`pages.controller.ts:218`).
- **Likely files:** `apps/api/src/pages/pages.service.ts`,
  `apps/api/src/pages/pages.controller.ts`,
  `apps/api/src/pages/entities/standalone-page.entity.ts`.
- **Acceptance criteria:**
  1. create/update/restore each reject a nonexistent (or wrong-scope, if blog checks
     scope) `featuredMediaId` with a controlled 400-class error — all 3 sites, count
     stated.
  2. The relation is defined and loading a page with the relation resolves its current
     revision; the schema is unchanged (no new migration generated or required).
  3. `resolveCurrentBody` is gone with zero remaining references.
  4. Swagger/JSDoc updated where contracts changed.
- **Documentation Impact:** `docs/features/pages.md` (featuredMediaId validation rule).

### subtask-6 — Public `/pages` index (API list endpoint + web route)

- **Register items closed:** line 26; tester guidance closes the web half of line 38.
- **Security review required: yes** (new public read path over publishable content).
- **Depends on:** subtask-5 (same pages module files). **Must not run concurrently with
  subtask-2** (both feed `docs/features/web-shell.md` and the web config surface).
- **Scope:** (a) API: a public `GET` list endpoint for published standalone pages
  returning only index-needs fields (slug, title, and `updatedAt` if the UI shows it —
  no body, no revision internals), with the publication predicate routed through the
  same shared helper/predicate as `findPublishedBySlug` (`status = 'published'`; keeps
  the nav-lockstep watch entry satisfied), deterministic ordering (title ascending), and
  Swagger documentation. (b) Web: new `apps/web/app/pages/page.tsx` index route
  rendering the list as links to `/pages/<slug>` in the established shell style with an
  empty state; the list fetch goes in `pages-client.ts` using the established
  error-envelope read pattern.
- **Likely files:** `apps/api/src/pages/pages.controller.ts`,
  `apps/api/src/pages/pages.service.ts`, `apps/web/app/pages/page.tsx` (new),
  `apps/web/app/pages/pages-client.ts`.
- **Acceptance criteria:**
  1. The list endpoint returns only published pages via the shared predicate — drafts
     never appear (predicate provable by executed, operator-pinned tests).
  2. The payload contains only index-needs fields.
  3. `/pages` renders the published list; a bare-`/pages` navigation item now resolves
     to a real page; the empty state renders cleanly.
  4. Ordering is deterministic (title ascending).
  5. Swagger documents the new endpoint.
- **Documentation Impact:** `docs/features/pages.md` (new endpoint + route),
  `docs/features/web-shell.md` (route map), `docs/features/navigation.md` (dead-link
  residual note removal).

### subtask-7 — Navigation `validateUrl` hardening

- **Register items closed:** line 22; tester guidance closes lines 24 and 39.
- **Security review required: no** (defense-in-depth on admin-only input).
- **Scope:** require internal navigation-item URLs to begin with a single `/` (reject
  protocol-relative `//`); external items keep their existing validation; enforcement is
  prospective-only (create/update — same posture as reserved slugs; existing rows are
  unaffected); uniform validation error message; JSDoc updated.
- **Likely files:** `apps/api/src/navigation/navigation.service.ts`.
- **Acceptance criteria:**
  1. Internal items whose URL does not start with `/`, or starts with `//`, are rejected
     with a controlled 400 on create and update; `/about` passes.
  2. External item validation is unchanged.
  3. Read paths are unaffected (prospective-only enforcement).
  4. JSDoc states the rule.
- **Documentation Impact:** `docs/features/navigation.md` (internal-URL rule).

### subtask-8 — Media sanitizer narrowing, tidy, and retroactive security review

- **Register items closed:** lines 32, 35; the folded specialist review closes line 29.
- **Security review required: yes — and the specialist stage must review the ENTIRE
  media subsystem** (upload handling, content-type validation, serve path, sanitizer),
  not just this diff: this discharges the retroactive review the ms3-completion cycle
  never ran. The Coordinator must not record this subtask complete without
  `security_report.md` + `security_result.json` or an explicit recorded waiver.
- **Scope:** (a) narrow the over-broad rejection patterns
  (`markdown-sanitizer.ts:21,33`): anchor `/on\w+\s*=/i` to HTML tag/attribute context
  and `/data\s*:/i` to URL positions (href/src/markdown link/image destinations), so
  prose like "training data: source A" passes while `<img onerror=…>`,
  `[x](data:text/html…)`, and `<a href="data:…">` remain rejected. Review the remaining
  `DANGEROUS_HTML_PATTERNS` entries for the same context-anchoring class of issue and
  state findings (breadth, not just the two named patterns). (b) Move
  `const { memoryStorage } = multer;` (`media.controller.ts:19`) below the import block.
- **Likely files:** `apps/api/src/media/markdown-sanitizer.ts`,
  `apps/api/src/media/media.controller.ts`.
- **Acceptance criteria:**
  1. Named legitimate-prose examples (incl. "training data: source A" and prose
     containing "onclick = handler") pass sanitization.
  2. Event-handler attributes and data:-URL link/image/attribute payloads remain
     rejected; the implementer enumerates the rejection classes covered.
  3. The pattern-table review is reported (which other patterns were checked, outcome).
  4. `memoryStorage` sits below the import block with no functional change.
  5. Sanitizer JSDoc/contract comments match the new behavior.
- **Documentation Impact:** `docs/features/media.md` (sanitizer behavior contract).

### subtask-9 — Web auth error-mapping testability

- **Register items closed:** implementer restructuring enables tester closure of lines 7
  and 36.
- **Security review required: no.**
- **Scope:** behavior-preserving restructure: export `toApiRequestError` /
  `describeRegistrationError` (`apps/web/app/register/page.tsx:34,49`) and the login-side
  error-mapping equivalents into an importable location (extend
  `apps/web/app/auth-client.ts` or add a colocated helper module under `apps/web/app/`),
  with the register/login pages consuming the exported versions. No rendered-message or
  UI-state changes.
- **Likely files:** `apps/web/app/register/page.tsx`,
  `apps/web/app/login/login-client.tsx`, `apps/web/app/auth-client.ts` (or one new
  colocated helper module).
- **Acceptance criteria:**
  1. The helpers are exported and importable by specs; pages consume the exported
     versions.
  2. Rendered error messages and UI states are unchanged in behavior (no visible
     change).
  3. No fetch-mocking obstacle remains for driving 400 / 409 / 5xx / network-failure
     responses through the exported helpers.
- **Documentation Impact:** none expected — state this explicitly in the documenter
  handoff (internal restructure; `docs/features/auth.md` only if its file map names the
  moved helpers).

### subtask-10 — CI/CD contract-test repair

- **Register items closed:** line 41.
- **Security review required: no.**
- **Justification as a subtask:** the register explicitly schedules this repair and the
  broken assertion fails `bash cicd/tests/run-validations.sh` on `main` — a distinct
  deliverable, not routine downstream test work.
- **Scope:** update the stale assertion (`cicd/tests/run-validations.sh:308`) to assert
  the documented hybrid default `^DB_HOST=127.0.0.1$` in `apps/api/.env.example` per
  `docs/operations/launch.md`, and add an assertion that the container-level
  `DB_HOST=mysql` override exists where it actually lives (verify: the Compose files
  under `cicd/docker/`).
- **Likely files:** `cicd/tests/run-validations.sh`; `cicd/tests/README.md` if the
  coverage description changes.
- **Acceptance criteria:**
  1. `bash cicd/tests/run-validations.sh` passes on the subtask branch.
  2. The env-example assertion matches the canonical contract in
     `docs/operations/launch.md`.
  3. A compose-level `DB_HOST=mysql` override assertion exists, pointing at the verified
     real location of the override.
- **Documentation Impact:** `cicd/tests/README.md` if coverage wording changes;
  otherwise none — state explicitly.

## Dependency Ordering and Parallelization

Sequencing constraints (file/doc-surface overlap):

- `subtask-1 → subtask-2` (both edit `apps/api/src/index.ts`; both feed deployment docs).
- `subtask-3 → subtask-4` (both edit `blog.service.ts` / blog docs).
- `subtask-5 → subtask-6` (both edit the pages module / pages docs).
- `subtask-6` must additionally not run concurrently with `subtask-2`
  (web-shell doc surface + web config overlap).

Conservative parallel plan:

- **Wave 1 (parallel-safe, disjoint file sets):** subtask-1, subtask-3, subtask-5,
  subtask-7, subtask-8, subtask-9, subtask-10.
- **Wave 2 (each starts when its dependency merges):** subtask-2 (after 1), subtask-4
  (after 3), subtask-6 (after 5 **and** after subtask-2 has merged, per the
  non-concurrency rule).

A fully serial fallback order is: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10.

## Register Traceability (coverage map)

| Register line (pre-cleanup) | Disposition |
|---|---|
| 3 | subtask-1 |
| 4 | subtask-2 |
| 5, 6 | register: suggested-milestone annotation (future identity pass) |
| 7 | subtask-9 (tester closure) |
| 8 | register: Slated MS6 |
| 9 | register: suggested milestone (pages enhancement) |
| 10 | register: conditional, suggested with future nav growth |
| 11 | register: Slated MS7/8 |
| 12 | register: Slated MS5 |
| 13, 14, 16 | register: Slated MS11 |
| 15, 17 | register: suggested milestone (next content milestone reusing the editor) |
| 18 | register: Slated MS4 (anti-spam) / MS11 (rate limits) |
| 19 | subtask-4 |
| 20 | subtask-3 |
| 21 | register: stays deferred (conditional perf) |
| 22 | subtask-7 |
| 23 | subtask-3 |
| 24 | subtask-7 (tester closure) |
| 25 | register: stays — marked operational action |
| 26 | subtask-6 |
| 27 | register: stays — watch entry |
| 28 | subtask-3 (tester closure) |
| 29 | subtask-8 (specialist security stage) |
| 30 | subtask-3 (tester closure) |
| 31 | subtask-5 |
| 32 | subtask-8 |
| 33 | subtask-5 |
| 34 | subtask-5 |
| 35 | subtask-8 |
| 36 | subtask-9 (tester closure) |
| 37 | register: stays — watch entry (subtask-6 must preserve lockstep) |
| 38 | subtask-5 (API half, tester) + subtask-6 (web half, tester) |
| 39 | subtask-7 (tester closure) |
| 40 | register: stays — decision record |
| 41 | subtask-10 |

## Overall Documentation Impact

- `docs/operations/deployment.md` — trusted-proxy and header-enforcement claims become
  true; refresh wording (subtask-1, subtask-2).
- `docs/features/auth.md` — audit-log IP semantics (subtask-1).
- `docs/features/web-shell.md` — security-header contract; `/pages` route-map row
  (subtask-2, subtask-6).
- `docs/development/api-conventions.md` — API security-header middleware note (subtask-2).
- `docs/features/blog.md` — comment payload + uniform-error contract; slug-collision
  retry behavior (subtask-3, subtask-4).
- `docs/features/pages.md` — featuredMediaId validation; public list endpoint + index
  route (subtask-5, subtask-6).
- `docs/features/navigation.md` — internal-URL rule; dead-link residual removal
  (subtask-6, subtask-7).
- `docs/features/media.md` — sanitizer behavior contract (subtask-8).
- `cicd/tests/README.md` — only if coverage wording changes (subtask-10).
- `docs/deferred-tasks.md` — planner-edited this cycle (annotations + scheduled markers);
  closed entries are removed in the next planning cycle after this plan completes.

## Validation Commands (shared)

Per `docs/development/testing.md`, every subtask runs, scoped to its change:

```bash
npx --yes pnpm@10.0.0 lint
npx --yes pnpm@10.0.0 typecheck
npx --yes pnpm@10.0.0 test
```

plus the API build (`pnpm --filter @sfus/api build` per `docs/development/workspace.md`)
for any API change (vitest passing does not prove the NodeNext CJS build; no
`import.meta` in API code). subtask-2 additionally runs
`bash cicd/scripts/smoke-validate.sh`; subtask-10 additionally runs
`bash cicd/tests/run-validations.sh`.

## Implementer Prompts

### Prompt — subtask-1

```text
Your role is 'implementer'. Your task is as follows:

This is subtask-1 of plan `deferred-cleanup`: implement the locked trusted-proxy
configuration for the API. SECURITY REVIEW REQUIRED: this subtask is security-sensitive
(trust-boundary / forwarded-header handling); a specialist security stage will review it.

Context: the MS1 foundation-decisions doc (the single file under docs/architecture/,
line 117) and docs/operations/deployment.md:94 describe a trusted-proxy configuration
that no code implements. The API runs behind exactly one shared nginx-proxy hop in
production; auth audit logging records `request.ip` at ~9 call sites and currently
captures the proxy IP.

Task:
1. Read the two doc references above; implement exactly the documented contract: set
   Express `trust proxy` on the Nest HTTP adapter for a single trusted hop so
   `request.ip` and `X-Forwarded-Proto` resolve from the forwarded headers.
2. Grep all `request.ip` audit call sites, state the count in your report, and confirm
   they need no call-site changes.
3. Update JSDoc/comments in the same commit; cite the decision-doc lines.

Allowed files: apps/api/src/index.ts; apps/api/src/config/environment.ts and
apps/api/src/config/config.constants.ts ONLY if the documented contract requires an
env-driven toggle (if you add an env var, it must also be added to the canonical table in
docs/operations/launch.md by the documenter — note this in your report).

Acceptance criteria:
- `trust proxy` is set for exactly one hop per the documented contract.
- Behind one simulated proxy hop, `request.ip` resolves the original client IP (the
  tester will prove this with an executed test; structure the bootstrap so it is
  testable).
- All `request.ip` audit call sites (count stated) receive the forwarded client IP with
  zero call-site changes.
- Direct (un-proxied) local dev behavior is unchanged.
- No stale "not configured" claims remain in code comments.

Validation: run each of npx --yes pnpm@10.0.0 lint / typecheck / test, plus the API
build per docs/development/workspace.md. Never report a command you did not run.

Tester handoff: API tests are colocated *.test.ts files in apps/api/src/; the trusted
proxy behavior test belongs in apps/api/src/index.test.ts (tester-owned — do not write
it yourself; do structure index.ts so the adapter setting is observable).

Artifacts: write implementer_report.md and implementer_result.json to
artifacts/deferred-cleanup/subtask-1/ (repository-root-relative).

If no blocking input is missing, continue past preflight into implementation in the same run.
Do not report success unless all required artifacts exist and all changes are committed.
```

### Prompt — subtask-2

```text
Your role is 'implementer'. Your task is as follows:

This is subtask-2 of plan `deferred-cleanup` (depends on subtask-1, same bootstrap
file): implement the locked baseline security-header/CSP policy at the app level.
SECURITY REVIEW REQUIRED: this subtask is security-sensitive (site-wide header policy);
a specialist security stage will review it.

Resolved decisions you must follow (do not re-open): app-level enforcement; compatible
baseline CSP enforced immediately (NOT Report-Only); HSTS stays at the shared
nginx-proxy tier — emit no HSTS from either app.

Task:
1. Web (apps/web/next.config.mjs, headers() for all routes): enforced CSP —
   default-src 'self'; script-src 'self' plus ONLY the allowances Next.js actually
   requires (verify empirically; justify each with an in-code comment); img-src and
   connect-src derived from the existing API-base env contract
   (docs/operations/launch.md) so hybrid dev (web :3000, API :3001) still works;
   frame-ancestors 'none'; object-src 'none'; base-uri 'self'. Plus
   X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin,
   X-Frame-Options: DENY, and a minimal Permissions-Policy.
2. API: add the `helmet` dependency (apps/api/package.json + pnpm-lock.yaml) and apply
   it in the bootstrap with JSON-API-appropriate defaults, HSTS disabled. Determine
   whether Swagger UI is mounted: if yes, configure and document its exception; if no,
   record in your report that no exception is needed.

Allowed files: apps/web/next.config.mjs, apps/api/src/index.ts, apps/api/package.json,
pnpm-lock.yaml.

Acceptance criteria:
- Every web route responds with the full baseline set; CSP is enforced, not Report-Only.
- Every API route responds with the helmet baseline minus HSTS.
- Landing, login, register, blog read, admin authoring, and image upload all work with
  zero CSP violations in hybrid-dev AND full-stack modes.
- Each CSP allowance beyond 'self' has an in-code justification comment.
- No Strict-Transport-Security header from either app.

Validation: run each of npx --yes pnpm@10.0.0 lint / typecheck / test, the API build
per docs/development/workspace.md, AND bash cicd/scripts/smoke-validate.sh. Never report
a command you did not run.

Tester handoff: web specs are *.spec.ts under apps/web (next.config.spec.ts covers the
config contract); API tests are colocated *.test.ts under apps/api/src/.

Artifacts: write implementer_report.md and implementer_result.json to
artifacts/deferred-cleanup/subtask-2/ (repository-root-relative).

If no blocking input is missing, continue past preflight into implementation in the same run.
Do not report success unless all required artifacts exist and all changes are committed.
```

### Prompt — subtask-3

```text
Your role is 'implementer'. Your task is as follows:

This is subtask-3 of plan `deferred-cleanup`: trim the public blog-comment payload and
normalize the comment-creation existence oracles. SECURITY REVIEW REQUIRED: this subtask
is security-sensitive (data minimization + oracle removal); a specialist security stage
will review it.

Verified context: toCommentDetail (apps/api/src/blog/blog.controller.ts:498-524)
serializes authorUserId, moderatedByUserId, moderatedAt into public comment responses;
no web component renders any of them (apps/web/app/blog/blog-client.ts declares them as
types only). Distinct post-visibility-gate 400 messages exist at blog.service.ts:399,402
(parentId: 'Parent comment not found.' vs 'Parent comment does not belong to this
post.') and blog.service.ts:415,418 (imageId: nonexistent vs wrong-scope).

Task:
1. Enumerate every toCommentDetail call site. Drop authorUserId, moderatedByUserId, and
   moderatedAt from PUBLIC comment responses (list + create). If any admin/moderation
   surface consumes the same serializer, split public vs admin serializers so admin
   capability is unchanged; state in your report which endpoints are admin-facing.
2. Update the web mirror types in apps/web/app/blog/blog-client.ts in the same change —
   both sides of the API/web mirror; leave zero references to the trimmed fields in
   apps/web.
3. Normalize the oracles: ONE uniform status + message for both parentId failure modes;
   ONE uniform status + message for both imageId failure modes. Uniform responses must
   not let a caller distinguish exists-but-foreign from nonexistent.
4. Update Swagger decorators and JSDoc in the same commit — a stale decorator is a
   defect.

Allowed files: apps/api/src/blog/blog.controller.ts, apps/api/src/blog/blog.service.ts,
apps/web/app/blog/blog-client.ts.

Acceptance criteria:
- Public comment payloads contain none of the three trimmed fields.
- Admin/moderation behavior unchanged (report states how).
- parentId and imageId rejections each return a single uniform message/class.
- Swagger response models and JSDoc match the new contract.
- Zero apps/web references to the trimmed fields remain.

Validation: run each of npx --yes pnpm@10.0.0 lint / typecheck / test, plus the API
build per docs/development/workspace.md. Never report a command you did not run.

Tester handoff: tester-owned files are apps/api/src/blog/blog.controller.test.ts,
apps/api/src/blog/blog.service.test.ts, and apps/web/app/blog/blog.spec.ts. The tester
will also add oracle-parity tests, controller-layer tests for parseCreateInput /
parseUpdateInput / parsePublishAtInput rejection paths and the per-handler
resolveSession + assertAdminManagementAccess wiring, and will adjust the createComment
Swagger source-contract lookback window — do not write those yourself, but keep the
controller structure compatible with them.

Artifacts: write implementer_report.md and implementer_result.json to
artifacts/deferred-cleanup/subtask-3/ (repository-root-relative).

If no blocking input is missing, continue past preflight into implementation in the same run.
Do not report success unless all required artifacts exist and all changes are committed.
```

### Prompt — subtask-4

```text
Your role is 'implementer'. Your task is as follows:

This is subtask-4 of plan `deferred-cleanup` (depends on subtask-3, same file): harden
blog slug persistence against the concurrent-create TOCTOU. Security review required: no.

Verified context: deriveUniqueSlug (apps/api/src/blog/blog.service.ts:555-575) checks
uniqueness with findOne lookups; the subsequent save (blog.service.ts:202) surfaces a
raw 500 when a concurrent create wins the race. The DB unique constraint already
prevents corruption — this fix is about the losing request succeeding.

Task:
1. Enumerate every write path that persists a deriveUniqueSlug result (create; check
   whether the update path also derives slugs). State the count in your report.
2. At each such site, catch the MySQL duplicate-key error (ER_DUP_ENTRY) on save, retry
   slug derivation with an incremented suffix, bounded to 3 attempts.
3. On exhaustion, return a controlled error-envelope response (409-class), never an
   unhandled 500.
4. Update JSDoc to state the retry semantics.

Allowed files: apps/api/src/blog/blog.service.ts.

Acceptance criteria:
- A save rejected with a duplicate-key error retries and succeeds with a suffixed slug
  (testable via a mocked rejection-then-success save sequence).
- Retries bounded at 3; exhaustion returns a controlled error envelope.
- All deriveUniqueSlug-consuming write paths covered; count stated.
- JSDoc updated.

Validation: run each of npx --yes pnpm@10.0.0 lint / typecheck / test, plus the API
build per docs/development/workspace.md. Never report a command you did not run.

Tester handoff: tester-owned file is apps/api/src/blog/blog.service.test.ts; the
required test kind is an executed unit test driving mocked duplicate-key rejection
sequences (a call-order mock that never exercises the retry is not a substitute).

Artifacts: write implementer_report.md and implementer_result.json to
artifacts/deferred-cleanup/subtask-4/ (repository-root-relative).

If no blocking input is missing, continue past preflight into implementation in the same run.
Do not report success unless all required artifacts exist and all changes are committed.
```

### Prompt — subtask-5

```text
Your role is 'implementer'. Your task is as follows:

This is subtask-5 of plan `deferred-cleanup`: pages module robustness fixes. Security
review required: no.

Verified context: pages.service.ts persists featuredMediaId unvalidated at three sites
(lines 172, 237, 310) while blog validates via assertFeaturedImageExists
(blog.service.ts:521-524); StandalonePageEntity.currentRevisionId
(apps/api/src/pages/entities/standalone-page.entity.ts:31) is a plain column with no
relation decorator (the FK exists in the milestone-three content migration);
pages.controller.ts:218 resolveCurrentBody is dead (zero callers; superseded by
resolveCurrentRevision).

Task:
1. Validate featuredMediaId existence on create, update, and restore — all 3 sites —
   mirroring the semantics of blog's assertFeaturedImageExists including any scope
   checks it performs (read it first).
2. Add the relation decorator for currentRevisionId so the ORM can load the current
   revision via relations, WITHOUT schema change: the FK already exists in the
   migration; configure the relation so no duplicate FK constraint or new migration is
   generated and all existing queries keep working.
3. Delete resolveCurrentBody.
4. Update Swagger/JSDoc where contracts changed.

Allowed files: apps/api/src/pages/pages.service.ts,
apps/api/src/pages/pages.controller.ts,
apps/api/src/pages/entities/standalone-page.entity.ts.

Acceptance criteria:
- create/update/restore each reject a nonexistent (or wrong-scope, matching blog)
  featuredMediaId with a controlled 400-class error — all 3 sites, count stated.
- The relation loads the current revision; schema unchanged (no new migration generated
  or required — verify and state how you confirmed this).
- resolveCurrentBody removed with zero remaining references.
- Swagger/JSDoc updated.

Validation: run each of npx --yes pnpm@10.0.0 lint / typecheck / test, plus the API
build per docs/development/workspace.md. The DB-gated integration spec
(SFUS_DB_INTEGRATION=1, see docs/development/testing.md section 5) must still pass if
you touch create()'s transaction shape. Never report a command you did not run.

Tester handoff: tester-owned file is apps/api/src/pages/pages.service.test.ts; the
tester will add featuredMediaId rejection tests at all three sites and strengthen the
API-side reserved-slug test from containment to set-equality/cardinality pinning.

Artifacts: write implementer_report.md and implementer_result.json to
artifacts/deferred-cleanup/subtask-5/ (repository-root-relative).

If no blocking input is missing, continue past preflight into implementation in the same run.
Do not report success unless all required artifacts exist and all changes are committed.
```

### Prompt — subtask-6

```text
Your role is 'implementer'. Your task is as follows:

This is subtask-6 of plan `deferred-cleanup` (depends on subtask-5; must not run
concurrently with subtask-2): add a public /pages index — API list endpoint + web index
route. SECURITY REVIEW REQUIRED: this subtask is security-sensitive (new public read
path over publishable content); a specialist security stage will review it.

Verified context: the pages controller exposes only @Get(":slug") publicly; there is no
list-published-pages endpoint and no apps/web/app/pages/page.tsx index route, so an
admin-authored bare-/pages navigation item resolves to a deliberate not-found state.

Task:
1. API: add a public GET list endpoint for published standalone pages. Payload: only
   index-needs fields (slug, title, plus updatedAt only if the UI displays it) — no
   body, no revision internals. The publication predicate MUST be routed through the
   same shared helper/predicate as findPublishedBySlug (status = 'published'); do not
   re-derive a partial predicate (this also preserves the pages/nav publication
   lockstep recorded in docs/deferred-tasks.md). Deterministic ordering: title
   ascending. Add Swagger decorators.
2. Web: create apps/web/app/pages/page.tsx rendering the published list as links to
   /pages/<slug> in the established shell style, with a clean empty state. Put the list
   fetch in apps/web/app/pages/pages-client.ts using the established error-envelope
   read pattern used by the other client reads (match it exactly — partial-breadth
   envelope handling is a known repository defect class).

Allowed files: apps/api/src/pages/pages.controller.ts,
apps/api/src/pages/pages.service.ts, apps/web/app/pages/page.tsx (new),
apps/web/app/pages/pages-client.ts.

Acceptance criteria:
- The list endpoint returns only published pages via the shared predicate; drafts never
  appear.
- Payload limited to index-needs fields.
- /pages renders the list; a bare-/pages navigation item now resolves to a real page;
  empty state renders cleanly.
- Ordering deterministic (title ascending).
- Swagger documents the endpoint.

Validation: run each of npx --yes pnpm@10.0.0 lint / typecheck / test, plus the API
build per docs/development/workspace.md. Never report a command you did not run.

Tester handoff: tester-owned files are apps/api/src/pages/pages.service.test.ts
(operator/equality-pinned predicate tests for the new list path) and
apps/web/app/pages/pages.spec.ts (index-route contract; web-side reserved-slug
set-equality/cardinality strengthening).

Artifacts: write implementer_report.md and implementer_result.json to
artifacts/deferred-cleanup/subtask-6/ (repository-root-relative).

If no blocking input is missing, continue past preflight into implementation in the same run.
Do not report success unless all required artifacts exist and all changes are committed.
```

### Prompt — subtask-7

```text
Your role is 'implementer'. Your task is as follows:

This is subtask-7 of plan `deferred-cleanup`: harden navigation validateUrl for internal
items. Security review required: no (defense-in-depth on admin-only input).

Verified context: validateUrl (apps/api/src/navigation/navigation.service.ts:278-285)
checks only non-empty + length <= 512, for both internal and external items.

Task:
1. Require internal navigation-item URLs to begin with a single '/'; reject
   protocol-relative '//' prefixes. External item validation unchanged.
2. Enforcement is prospective-only (create/update) — existing rows unaffected, same
   posture as reserved-slug enforcement. State this in JSDoc.
3. Use one uniform validation error message for the new rejection.

Allowed files: apps/api/src/navigation/navigation.service.ts.

Acceptance criteria:
- Internal items whose URL does not start with '/' or starts with '//' are rejected
  with a controlled 400 on create and update; '/about' passes.
- External item validation unchanged.
- Read paths unaffected.
- JSDoc states the rule and the prospective-only posture.

Validation: run each of npx --yes pnpm@10.0.0 lint / typecheck / test, plus the API
build per docs/development/workspace.md. Never report a command you did not run.

Tester handoff: tester-owned file is apps/api/src/navigation/navigation.service.test.ts.
The tester will also (a) pin the LessThanOrEqual FindOperator TYPE in the publication-
predicate assertions to match blog.service.test.ts:207-209 (shape-only pinning is a
known repository defect class), and (b) add the moderator-role findForAuthenticatedUser
test and the all-children-filtered-out-but-parent-visible edge test. Keep the service
structure compatible.

Artifacts: write implementer_report.md and implementer_result.json to
artifacts/deferred-cleanup/subtask-7/ (repository-root-relative).

If no blocking input is missing, continue past preflight into implementation in the same run.
Do not report success unless all required artifacts exist and all changes are committed.
```

### Prompt — subtask-8

```text
Your role is 'implementer'. Your task is as follows:

This is subtask-8 of plan `deferred-cleanup`: narrow the markdown-sanitizer rejection
patterns and tidy the media controller. SECURITY REVIEW REQUIRED — EXPANDED SCOPE: this
subtask is security-sensitive, and its specialist security stage must review the ENTIRE
media subsystem (apps/api/src/media/: upload handling, content-type validation, serve
path, sanitizer), not just your diff. This discharges the retroactive media review that
the ms3-completion cycle never ran (docs/deferred-tasks.md). Flag this expanded scope in
your report so the Coordinator passes it to the security stage.

Verified context: DANGEROUS_HTML_PATTERNS in
apps/api/src/media/markdown-sanitizer.ts:21,33 includes the context-free patterns
/on\w+\s*=/i and /data\s*:/i, which reject legitimate prose such as "training data:
source A". const { memoryStorage } = multer; sits inside the import block at
apps/api/src/media/media.controller.ts:19.

Task:
1. Anchor /on\w+\s*=/i to HTML tag/attribute context and /data\s*:/i to URL positions
   (href/src attribute values and markdown link/image destinations) so that:
   - prose like "training data: source A" and "the onclick = handler pattern" PASSES;
   - <img onerror=...>, [x](data:text/html...), and <a href="data:..."> remain REJECTED.
2. Review the REMAINING DANGEROUS_HTML_PATTERNS entries for the same context-anchoring
   issue class; state per-pattern findings in your report (breadth over the table, not
   just the two named patterns).
3. Move the memoryStorage destructuring below the import block (no functional change).
4. Update sanitizer JSDoc/contract comments to match the new behavior.

Allowed files: apps/api/src/media/markdown-sanitizer.ts,
apps/api/src/media/media.controller.ts.

Acceptance criteria:
- The named legitimate-prose examples pass sanitization.
- Event-handler-attribute and data:-URL payload classes remain rejected; rejection
  classes enumerated in the report.
- Per-pattern review of the rest of the table reported.
- memoryStorage sits below the imports with no functional change.
- JSDoc/contract comments updated.

Validation: run each of npx --yes pnpm@10.0.0 lint / typecheck / test, plus the API
build per docs/development/workspace.md. Never report a command you did not run.

Tester handoff: tester-owned files are apps/api/src/media/markdown-sanitizer.test.ts and
apps/api/src/media/media.controller.test.ts. Existing tests codify the old broad
behavior — the tester will rewrite them as paired accept-class/reject-class suites
covering the input-format class, not single reproductions.

Artifacts: write implementer_report.md and implementer_result.json to
artifacts/deferred-cleanup/subtask-8/ (repository-root-relative).

If no blocking input is missing, continue past preflight into implementation in the same run.
Do not report success unless all required artifacts exist and all changes are committed.
```

### Prompt — subtask-9

```text
Your role is 'implementer'. Your task is as follows:

This is subtask-9 of plan `deferred-cleanup`: behavior-preserving restructure of the web
auth error-mapping helpers for runtime testability. Security review required: no.

Verified context: toApiRequestError and describeRegistrationError are unexported
module-level functions in apps/web/app/register/page.tsx (lines 34, 49); the login path
has equivalent mapping logic. Every apps/web spec is source-contract style (no fetch
mocking anywhere in the web suite), so the 400/409/5xx/network-failure mapping branches
— including the statusCode === null branch at register/page.tsx:65 — have never been
executed by a test.

Task:
1. Move/export toApiRequestError, describeRegistrationError, and the login-side
   error-mapping equivalents into an importable location: extend
   apps/web/app/auth-client.ts or create ONE colocated helper module under apps/web/app/
   — pick the option that matches the existing client-module conventions; state your
   pick and rationale in the report.
2. Update the register and login pages to consume the exported versions.
3. Change NO behavior: rendered error messages and UI states must be identical.

Allowed files: apps/web/app/register/page.tsx, apps/web/app/login/login-client.tsx,
apps/web/app/auth-client.ts (or the one new colocated helper module).

Acceptance criteria:
- Helpers are exported and importable by specs; pages consume the exported versions.
- Rendered error messages and UI states are unchanged.
- Nothing blocks a spec from driving mocked 400 / 409 / 5xx / network-failure (null
  statusCode) responses through the exported helpers.

Validation: run each of npx --yes pnpm@10.0.0 lint / typecheck / test. Never report a
command you did not run.

Tester handoff: tester-owned files are apps/web/app/public-shell.spec.ts and/or a new
colocated spec. The required test kind is EXECUTED runtime tests with mocked responses
proving 400 validation mapping, 409 duplicate-email messaging, 5xx masking, and the
statusCode === null network-failure branch — source-text grepping is not a substitute.

Artifacts: write implementer_report.md and implementer_result.json to
artifacts/deferred-cleanup/subtask-9/ (repository-root-relative).

If no blocking input is missing, continue past preflight into implementation in the same run.
Do not report success unless all required artifacts exist and all changes are committed.
```

### Prompt — subtask-10

```text
Your role is 'implementer'. Your task is as follows:

This is subtask-10 of plan `deferred-cleanup`: repair the stale CI/CD contract-test
assertion. Security review required: no.

Verified context: cicd/tests/run-validations.sh:308 asserts '^DB_HOST=mysql$' in
apps/api/.env.example, but the example legitimately ships the hybrid-dev default
DB_HOST=127.0.0.1 (line 44) per docs/operations/launch.md — so
`bash cicd/tests/run-validations.sh` currently FAILS on main. The Compose files under
cicd/docker/ override DB_HOST to mysql for containers.

Task:
1. Update the assertion to expect the documented hybrid default '^DB_HOST=127.0.0.1$'
   in apps/api/.env.example.
2. Verify where the container-level DB_HOST=mysql override actually lives (check
   cicd/docker/compose.dev.yml and compose.prod.yml) and add an assertion pinning that
   override at its real location.
3. Mind the repository's known shell pitfalls: the suite runs under bash -e; avoid
   arithmetic (( )) abort patterns and keep assertions robust to format variants.

Allowed files: cicd/tests/run-validations.sh; cicd/tests/README.md only if its coverage
description changes.

Acceptance criteria:
- bash cicd/tests/run-validations.sh passes on the subtask branch.
- The env-example assertion matches the canonical contract in
  docs/operations/launch.md.
- A compose-level DB_HOST=mysql override assertion exists at the verified real location.

Validation: bash cicd/tests/run-validations.sh, plus run each of
npx --yes pnpm@10.0.0 lint / typecheck / test to confirm no workspace impact. Never
report a command you did not run.

Tester handoff: this subtask's product IS a test harness file; the tester validates by
executing bash cicd/tests/run-validations.sh and reviewing assertion coverage against
cicd/tests/README.md — no separate tester-owned file is expected.

Artifacts: write implementer_report.md and implementer_result.json to
artifacts/deferred-cleanup/subtask-10/ (repository-root-relative).

If no blocking input is missing, continue past preflight into implementation in the same run.
Do not report success unless all required artifacts exist and all changes are committed.
```
