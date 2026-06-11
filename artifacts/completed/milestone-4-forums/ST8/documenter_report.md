# Documenter Report

Status:
- success

Task summary:
- ST8 Security Remediation Pass 2: validated three security fixes — (1) linear indexOf-based ReDoS-safe link scanner replacing backtracking regex in link-limit.ts; (2) broadened evasion detection for ftp://, mailto:, tel:, www.-prefixed hosts; (3) THROTTLE_* env vars added to apps/api/.env.example. Tester added a ReDoS regression test, evasion tests, and a new throttle.guard.test.ts (fail-closed, IP-fallback, sweep). Full suite green.

Branch name:
- ms4-st8-documenter-20260608

Documentation commit hash:
- 04932860a065b9b13c4422bd7ac2efd2ed939e7c

Documentation files added or modified:
- docs/development/api-conventions.md

Commands run:
- git diff ms4 -- apps/api/src/common/throttle/ apps/api/src/config/environment.ts apps/api/src/app.module.ts apps/api/.env.example docs/
- git add docs/development/api-conventions.md
- git commit -m "docs(api-conventions): correct new-account tier and expand link-limit section (ST8 pass-2)"

Final test outcomes:
- All tests green on ms4-st8-documenter-20260608 branch as of tester pass. Documentation-only changes made; no test behavior modified.

Changes made:
- Corrected the "New-account tier" paragraph (P1 fix): removed the inaccurate claim that the guard supplies userCreatedAt from the session payload. ThrottleGuard passes userCreatedAt: null in ST8; the tier will activate once ST9 wires the guard with the authenticated user's account creation time.
- Expanded the "Per-post link limit" section to document pass-2 security additions: ftp://, mailto:, tel: evasion-scheme detection, bare www.-prefixed host counting, linear-time indexOf-based scanner, and the 256 KB scan cap.
- Confirmed launch.md THROTTLE_* env-var table is present and accurate — no changes required.

Assumptions:
- Comparison base is ms4 (inferred from worktree branch naming and task description).
- Shared artifact directory is artifacts/milestone-4-forums/ST8 (provided in task).

Artifacts written:
- artifacts/milestone-4-forums/ST8/documenter_report.md
- artifacts/milestone-4-forums/ST8/documenter_result.json
- artifacts/milestone-4-forums/ST8/verifier_prompt.txt
