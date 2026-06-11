# Implementer Report — ST17 Tester-Driven Remediation

**Status:** PASS

**Task summary:**
TESTER-DRIVEN REMEDIATION (one allowed): Add `// eslint-disable-next-line @next/next/no-img-element`
on the line immediately above the native `<img>` in `user-avatar.tsx` to fix the
`@next/next/no-img-element` lint warning reported by the Tester. Minimal fix matching established
repo convention.

## Changed files

- `apps/web/components/user-avatar.tsx`

## Implementation/code commit hash

`d385adfb6ba1d3346f3ed0f8839a46c5fa17dfe0`

## Fix applied

Added `// eslint-disable-next-line @next/next/no-img-element` on the line immediately above the
`<img>` element in `user-avatar.tsx` (~line 102). The avatar component uses a dynamic user-supplied
image from the gated `/api/media/<id>` path with an `onError`->initials fallback; raw `<img>` is
the repo-consistent choice for this use case. Convention matches:
- `apps/web/app/[slug]/page.tsx:118-119`
- `apps/web/app/pages/[slug]/page.tsx:67-68`

No behavior change — purely suppresses the lint warning.

## Validation commands run

1. `pnpm --dir <worktree> install --frozen-lockfile`
2. `<worktree>/node_modules/.bin/vitest run --root apps/web`
3. `pnpm --dir <worktree> typecheck`
4. `pnpm --dir <worktree> lint`

## Validation outcomes

- **Tests:** 407 pass, 0 fail (12 test files; user-avatar.spec.ts 16 tests, users-profile.spec.ts 12 tests — all ST17 specs pass)
- **Typecheck:** 0 errors
- **Lint:** exit 0, 0 warnings (DEFECT REPAIRED — was exit 1 with 1 warning before fix)

## Artifacts written

- `artifacts/milestone-4-forums/ST17/implementer_report.md`
- `artifacts/milestone-4-forums/ST17/tester_prompt.txt`
- `artifacts/milestone-4-forums/ST17/implementer_result.json`

## History preserved

Prior tester FAIL artifacts archived at:
`artifacts/milestone-4-forums/ST17/history/tester-1-fail/`
