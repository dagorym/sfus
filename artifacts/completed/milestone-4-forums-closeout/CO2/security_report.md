Security Review Report

Scope reviewed:
- Specialist security review of Milestone 4 forums closeout subtask CO2 (plans/milestone-4-forums-closeout-plan.md).
- Change under review: a defense-in-depth prefix guard added to resolveAvatarSrc() in apps/web/components/user-avatar.tsx. The new line `if (!avatarSrc.startsWith("/api/media/")) return null;` is inserted between the pre-existing falsy/hasError guard and the verbatim return, so any value not beginning with the gated literal prefix "/api/media/" falls back to initials (null).
- The guarded value flows into a rendered avatar image src: UserAvatar renders <img src={resolvedSrc}> only when resolvedSrc is truthy (apps/web/components/user-avatar.tsx:108-117), making this a classic open-redirect / script-URI (javascript:/data:) injection sink.
- Files reviewed against CO2 base d5084cf..HEAD: apps/web/components/user-avatar.tsx (implementer guard + JSDoc), apps/web/components/user-avatar.spec.ts (8 new prefix-rejection tests, 24 total), docs/features/web-shell.md (Security note updated to reflect the enforced guard).
- Upstream artifacts reviewed: CO2 implementer_report.md, tester_report.md, documenter_report.md under artifacts/milestone-4-forums-closeout/CO2/.

Why specialist review was triggered:
- The planner marked subtask CO2 'Security review: required' because the change adds a defense-in-depth gate on a value that is rendered into an <img src> attribute, a known open-redirect / script-URI injection sink.
- A flaw in the guard could allow off-origin navigation (open redirect / SSRF-adjacent fetch) or a javascript:/data: URI to reach the DOM, so the guard's bypass-resistance and fail-closed behavior must be confirmed by specialist review rather than a routine verifier pass.

Acceptance criteria / plan reference:
- plans/milestone-4-forums-closeout-plan.md — subtask CO2 (resolveAvatarSrc /api/media/ prefix gate; Security review: required).
- Acceptance criteria evaluated: (AC1) every value not beginning with /api/media/ is rejected to null; (AC2) a valid /api/media/<id> path is returned unchanged when hasError is false; existing hasError=true degradation invariant preserved.
- Server-side origin contract: docs/features/web-shell.md and apps/web/app/users/[username]/page.tsx:13 (avatarSrc originates exclusively from the gated /api/media/<id> serve path, ST15/ST12).

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/web/components/user-avatar.tsx:82 - The prefix guard is defense-in-depth layered on top of a server-side gate that already constrains avatarSrc to /api/media/<id>; it is not the sole control. This is the correct posture and is noted for completeness, not as a defect.
  The value originates server-side as a gated /api/media/<id> path (profile-projection.ts and the users/profile pages). CO2 changed only user-avatar.tsx/.spec.ts/web-shell.md, so the upstream gating is not weakened by this change. The guard adds a fail-closed second layer should a caller ever pass an un-gated URL.
- apps/web/components/user-avatar.tsx:82 - startsWith is exact and case-sensitive, so case/whitespace variants (e.g. "/API/MEDIA/x", " /api/media/x") are REJECTED, not normalized. Rejection (null -> initials) is the safe fallback, so this strictness is correct and intentional; documented behavior matches.
  A case-insensitive or trimming guard would be looser, not safer. The strict comparison guarantees that any accepted value literally begins with the same-origin path-absolute prefix, which is exactly what makes off-origin and scheme escapes impossible. No action required.

Test sufficiency assessment:
- SUFFICIENT for the security-sensitive behavior. apps/web/components/user-avatar.spec.ts adds 8 negative tests (24 total) covering every enumerated dangerous class: http:// and https:// (off-origin/open-redirect), protocol-relative //, javascript: (script-injection), data: (inline-data injection), whitespace-only (truthy-but-rejected, exercising the new guard line specifically), and a non-matching relative path (/static/...). A positive AC2 test confirms a valid /api/media/<uuid> path is returned unchanged.
- The pre-existing hasError=true degradation test (spec lines 85-88) and the null/empty cases remain intact, confirming no regression to the error fallback.
- The whitespace-only case ("   ", false) is non-vacuous: it is truthy so it bypasses the original falsy guard and is rejected solely by the new startsWith guard.
- Executed validation (worktree ms4a-CO2-security-20260608, deps installed offline): `pnpm --filter @sfus/web exec vitest run components/user-avatar.spec.ts` -> 24 passed (24). `pnpm --filter @sfus/web run typecheck` (tsc --noEmit) -> clean. `pnpm --filter @sfus/web run lint` (eslint --max-warnings=0) -> clean. No tests assert insecure behavior.

Documentation / operational guidance assessment:
- SUFFICIENT. docs/features/web-shell.md Security note now states resolveAvatarSrc enforces the /api/media/ prefix before returning and enumerates the rejected classes (http(s)://, protocol-relative //, javascript:, data:, empty/whitespace), describing it as a defense-in-depth guard that holds even if callers misbehave.
- The in-file JSDoc on resolveAvatarSrc (user-avatar.tsx:66-76) matches the documented behavior and the implemented guard. The caller contract (avatarSrc must be the gated /api/media/<id> path) is retained, so the doc does not weaken or contradict the server-side origin guarantee.
- No operational/runbook impact: the change is a pure client-side narrowing with no new env, config, or deployment surface.

Artifacts written:
- artifacts/milestone-4-forums-closeout/CO2/security_report.md
- artifacts/milestone-4-forums-closeout/CO2/security_result.json

Outcome:
- PASS
