# Verifier Report — docs-slug-autoderive

**Plan:** ms5-documents-wiki  
**Subtask:** docs-slug-autoderive  
**Verifier branch:** ms5-docslug-verifier-20260612  
**Date:** 2026-06-12  
**Verdict:** PASS

---

## Scope

This subtask makes the `slug` field optional on `POST /api/docs`. When omitted or blank, the server auto-derives a slug from the page title (lowercase, non-alphanumeric runs → hyphens, leading/trailing hyphens stripped, fallback "page", truncate to 250 chars). Derived-slug collisions are resolved by appending `-2`, `-3`, … inside the DB transaction. Explicit slugs retain all prior behavior (validation, 409 on collision).

---

## Acceptance Criteria Checklist

| # | Criterion | Result |
|---|-----------|--------|
| A | Omitted slug → auto-derived from title | PASS |
| B | Blank slug → auto-derived (not 400) | PASS |
| C | Derived slug collision → `-2` suffix | PASS |
| D | Degenerate title (e.g. `"!!!"`) → fallback `"page"` | PASS |
| E | Explicit slug preserved; collision still 409 | PASS |
| F | Auto-derived slug under parent → correct prefixed path | PASS |
| G | Controller: omitted/blank slug → 201, not 400 | PASS |

---

## Code Review

**Files reviewed (read-only):**
- `apps/api/src/docs/docs.types.ts`
- `apps/api/src/docs/docs.service.ts`
- `apps/api/src/docs/docs.controller.ts`

### docs.types.ts
`CreateDocPageInput.slug` is now `slug?: string` (line 190) with full JSDoc describing auto-derivation and collision-suffixing behavior. `RenameDocPageInput.slug` is correctly left unchanged (still "one of slug/title required" for PATCH).

### docs.service.ts — `createPage` method
- `isExplicitSlug` check (`typeof input.slug === "string" && input.slug.trim().length > 0`) correctly branches between explicit and derived paths.
- Explicit path: `validateSlug` still called; 409 on collision preserved.
- `validateTitle` called unconditionally regardless of slug mode.
- Derivation algorithm:
  1. `baseSlug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")`
  2. Fallback to `"page"` if result is empty
  3. Truncate to 250 chars
  4. Collision loop inside transaction: base slug first, then `${baseSlug}-${suffix + 1}` starting with `suffix = 1` → produces `-2` on first collision (correct behavior matching AC-C)
- The loop's off-by-one is intentional and correct: the series is base, base-2, base-3, … (not base-1).
- Transaction wraps the uniqueness check and insert atomically (P10 compliance).

### docs.controller.ts
- Explicit slug guard removed from the create path.
- Title-present guard retained (lines 190–192).
- Comment added confirming slug is optional.

**Code verdict: PASS — no defects found.**

---

## Test Review

**Files reviewed (read-only):**
- `apps/api/src/docs/docs.service.test.ts`
- `apps/api/src/docs/docs.controller.test.ts`

### Service tests (lines 965–1102)
New block: `"DocsService.createPage (slug auto-derivation: omitted/blank slug)"`. Coverage:
- A: omitted slug → `"hello-world"` ✓
- B: blank slug → `"hello-world"` ✓
- C: collision → base slug first, then `-2` suffix ✓; full integration test with actual path collision ✓
- D: degenerate `"!!!"` → `"page"` ✓; `"page-2"` on collision ✓
- E: explicit slug preserved ✓; 409 on explicit collision ✓
- F: derived under parent → `"parent/child-page"` ✓

Regression fix at line 898: blank slug on existing code path → resolves without 400.

### Controller tests (lines 475–487)
- Blank slug → 201 ✓ (AC-B regression fix)
- Omitted slug → 201 ✓ (AC-G)

### Test run results
All 2,250 tests passed, 0 failures. TypeScript type check clean. ESLint clean.

Command used (from worktree): `pnpm --dir <worktree-root> --filter api run test`

**Test verdict: PASS — all A-G acceptance criteria covered, full suite green.**

---

## Documentation Review

**File reviewed (read-only):**
- `docs/features/documents.md`

### POST /api/docs request table (line 172)
- `slug` row: Required = `no`; description covers optional, auto-derivation from title, and collision suffixing. ✓

### POST /api/docs error table (lines 184, 187)
- 400 row updated: "Invalid explicit slug or title; or parent specified but does not exist" (auto-derived slugs bypass explicit-slug validation). ✓
- 409 row updated: clarifies explicit slug collisions and notes auto-derived slugs avoid this via numeric suffixing. ✓

### "Slug and title validation" section (lines 298–299)
- Explicitly states `validateSlug` is called only for explicit slugs on create or rename; auto-derived slugs bypass it. ✓

### PATCH /api/docs/:id rename table (lines 230–235)
- `slug` row unchanged: still "one of slug/title required" for rename. ✓ (Correct: rename does not auto-derive slugs.)

**Documentation verdict: PASS — all required updates present and accurate. No regressions introduced.**

---

## Summary

All three verification dimensions pass without reservation. The implementation is correct, the test suite is comprehensive and green, and the documentation accurately reflects the new contract. No blocking findings, no warnings, no notes of concern.

**Final verdict: PASS**
