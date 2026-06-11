# Tester Report — ST17: Public Profile Page + Avatar Upload & Display
## Pass 2 (Lint-Fix Remediation Confirmation)

**Outcome: PASS**
**Branch:** ms4-st17-tester-20260608
**Date:** 2026-06-08

---

## Scope

ST17 implements the user-facing public profile page (`/users/[username]`) and avatar
upload/display pipeline:

- `UserAvatar` React component with initials fallback and `onError` degradation
- `users-profile` page at `/app/users/[username]/page.tsx` with five-field
  `profileProjection()` allowlist (username, displayName, bio, avatarMediaId, createdAt)
- Avatar upload/remove controls in `/profile` via `ImageUpload(resourceType='avatar')`
- Avatar display integrated into `mention-autocomplete` byline

## Pass-1 Recap

Pass-1 returned FAIL for a single defect: `pnpm lint` exited 1 because
`apps/web/components/user-avatar.tsx` used a native `<img>` element, triggering the
`@next/next/no-img-element` ESLint rule under `--max-warnings=0`. All other checks
(407 web tests, typecheck 0 errors, ST14 five-field allowlist, ST16 regression) were
green.

## Lint Remediation (Implementer Fix)

The implementer added a single-line eslint-disable comment scoped to the `<img>` line
only:

```tsx
// eslint-disable-next-line @next/next/no-img-element
<img
  src={resolvedSrc}
  ...
/>
```

This matches the existing repo convention (`apps/web/app/[slug]/page.tsx`,
`apps/web/app/pages/[slug]/page.tsx`). No behavior change was made; the `onError`
→ initials fallback is unchanged.

---

## Validation Matrix — Pass 2

| Check | Command | Result |
|-------|---------|--------|
| Dependencies | `pnpm --dir <worktree> install --frozen-lockfile` | Done in 1.1s |
| Web tests | `<worktree>/node_modules/.bin/vitest run --root apps/web` | **407 passed / 0 failed** |
| Typecheck | `pnpm --dir <worktree> typecheck` | **0 errors** |
| Lint | `pnpm --dir <worktree> lint` | **CLEAN — exit 0, 0 warnings** |

### Lint Full Output

```
> sfus-milestone-1@0.1.0 lint /home/tstephen/repos/worktrees/ms4-st17-tester-20260608
> pnpm -r --filter "./apps/*" run lint

Scope: 2 of 4 workspace projects
apps/api lint$ eslint "src/**/*.ts" --max-warnings=0
apps/web lint$ eslint app components --ext .ts,.tsx --max-warnings=0
apps/api lint: Done
apps/web lint: Done
```

Exit code: 0. Zero warnings. The `@next/next/no-img-element` defect is resolved.

### Web Test Breakdown

```
 ✓ components/navigation.spec.ts (13 tests)
 ✓ components/recent-posts-feed.spec.ts (11 tests)
 ✓ app/public-shell.spec.ts (6 tests)
 ✓ components/mention-autocomplete.spec.ts (24 tests)
 ✓ app/forums/forums.spec.ts (51 tests)
 ✓ app/auth-error-helpers.spec.ts (13 tests)
 ✓ app/pages/pages.spec.ts (85 tests)
 ✓ app/blog/blog.spec.ts (116 tests)
 ✓ components/authoring-components.spec.ts (47 tests)
 ✓ components/user-avatar.spec.ts (16 tests)
 ✓ next.config.spec.ts (13 tests)
 ✓ app/users/users-profile.spec.ts (12 tests)

 Test Files  12 passed (12)
      Tests  407 passed (407)
   Duration  647ms
```

ST17-specific specs: `user-avatar.spec.ts` (16 tests) and `users-profile.spec.ts`
(12 tests) — all 28 non-vacuous ST17 specs execute and pass.

---

## Acceptance Criteria Verification

| AC | Description | Status |
|----|-------------|--------|
| AC1 | `/users/[username]` public profile page renders | PASS — users-profile.spec.ts 12/12 |
| AC2 | `profileProjection()` five-field allowlist (username, displayName, bio, avatarMediaId, createdAt) | PASS — tested in users-profile.spec.ts |
| AC3 | `UserAvatar` component with initials fallback | PASS — user-avatar.spec.ts 16/16 |
| AC4 | `onError` → initials fallback behavior unchanged | PASS — behavior confirmed in user-avatar.tsx, tests verify it |
| AC5 | Avatar upload/remove via `ImageUpload(resourceType='avatar')` in `/profile` | PASS — implemented and covered |
| AC6 | Avatar display in mention-autocomplete byline | PASS — mention-autocomplete.spec.ts 24/24 |
| AC7 | ST16 mention-autocomplete regression: none | PASS — 24/24 pass |
| AC8 | Lint clean (0 warnings, exit 0) | PASS — confirmed this pass |
| AC9 | Typecheck 0 errors | PASS |

---

## Regression Check

- **ST16 mention-autocomplete**: `components/mention-autocomplete.spec.ts` — 24/24 pass.
  No regression.
- **ST14 five-field allowlist**: profileProjection fields (username, displayName, bio,
  avatarMediaId, createdAt) confirmed in implementation.
- All 379 non-ST17 tests continue to pass.

---

## Scope Confirmation

The eslint-disable is scoped to a single line:
- Line 102: `// eslint-disable-next-line @next/next/no-img-element`
- Line 103: `<img ...` (the affected line)

It is NOT a file-wide disable (`/* eslint-disable */`). The rest of the file is fully
linted.

---

## Test Commit

No test changes were made by the Tester. The Implementer's lint-fix commit
(`d385adf fix(web): suppress no-img-element lint warning in UserAvatar`) is the only
change from pass-1.

**test_commit_hash: No Changes Made**

---

## Artifacts Written

- `artifacts/milestone-4-forums/ST17/tester_report.md` (this file)
- `artifacts/milestone-4-forums/ST17/tester_result.json`
- `artifacts/milestone-4-forums/ST17/verifier_prompt.txt`
