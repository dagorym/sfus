# Security Report

## Review scope and activation
- **Task:** `auth-followup-1`
- **Why specialist review was required:** `plans/auth-follow-up-fixes-plan.md` marks Subtask 1 as security-sensitive because it changes the auth registration flow and user-visible failure handling.
- **Plan reference:** `plans/auth-follow-up-fixes-plan.md` (Subtask 1: Registration reliability and diagnostics)
- **Reviewed surface:**
  - `apps/web/app/register/page.tsx`
  - `apps/api/src/auth/auth.service.ts`
  - `apps/api/src/auth/auth.service.test.ts`
  - `apps/web/app/public-shell.spec.ts`
  - `docs/website-launch-guide.md`
  - upstream artifact chain under `artifacts/auth-follow-up-fixes-plan/auth-followup-1/`
- **Next concrete review action:** inspect the register-page ↔ API trust boundary, duplicate-account/error-message handling, token/session behavior, negative-path coverage, and verifier evidence.

## Security assessment summary
- The frontend keeps the sensitive trust boundary on the API side and only consumes the structured JSON error envelope (`apps/web/app/register/page.tsx:29-67`).
- Duplicate-account handling is improved for the browser UX without exposing token material: the UI collapses `409` duplicate-email and duplicate-username responses into one combined message (`apps/web/app/register/page.tsx:54-59`), while the API still enforces uniqueness before persistence (`apps/api/src/auth/auth.service.ts:209-222`).
- Development-only verification-token exposure remains gated by `nodeEnv !== "production"` (`apps/api/src/auth/auth.service.ts:274-280`), so the change does not widen production token exposure.
- User-visible 5xx handling is safely generalized to prerequisite/setup guidance instead of echoing internal server details (`apps/web/app/register/page.tsx:60-66`; `apps/api/src/common/filters/json-exception.filter.ts:69-83`).
- Validation messages exposed to the UI are limited to bounded auth-input messages defined in the auth service (`apps/api/src/auth/auth.service.ts:1285-1313`), not stack traces or secret-bearing payloads.

## Findings

### BLOCKING
- None.

### WARNING
- None.

### NOTE
1. **Web negative-path coverage is source-contract level, not executed UI behavior.**  
   Evidence: `apps/web/app/public-shell.spec.ts:105-122` asserts the presence of status-code branches and user-facing strings in source, but it does not execute `toApiRequestError()` / `describeRegistrationError()` against mocked 400/409/5xx responses. API-side auth tests are strong, so this is not a release blocker, but future auth-error changes would be safer with an executed UI test that proves 5xx masking and duplicate-message collapsing at runtime.

## Trust-boundary and auth-specific review
- **Trust boundaries:** browser input is validated again on the API, and the browser only sees structured error envelopes. No new client-side trust assumption was introduced.
- **Auth/session handling:** registration still requires verification before normal password login, and the automatic development flow only continues when the API explicitly returns a verification token. No session or MFA shortcuts were added.
- **Validation:** username and password constraints shown in the UI match the backend-enforced rules closely enough for safe use (`apps/web/app/register/page.tsx:187-229`; `apps/api/src/auth/auth.service.ts:1285-1313`).
- **Duplicate-account handling:** browser output avoids telling the user whether email or username matched by using one combined duplicate message for `409` responses.
- **Error-message exposure:** 400-class messages are bounded validation/auth messages; 5xx responses are masked to prerequisite guidance; production verification tokens remain suppressed.
- **Secrets/token exposure:** no new secret or token leak was introduced. Development-only verification-token behavior remains explicitly non-production.
- **Unsafe defaults:** none found in the reviewed change set.
- **Missing negative coverage:** limited to the note above about runtime UI error-branch execution coverage.

## Test sufficiency assessment
- **Overall assessment:** sufficient for this subtask's current risk level.
- `apps/api/src/auth/auth.service.test.ts` covers duplicate-email and duplicate-username conflict behavior plus existing verification/password/session invariants, which is the more security-critical side of this change.
- The verifier and this review both observed passing targeted auth/web tests in this worktree after dependency install.
- Residual gap: the web-side test is static/source-contract coverage rather than executed error-handling behavior, captured as a note instead of a blocker.

## Documentation sufficiency assessment
- **Assessment:** sufficient for safe operation.
- `docs/website-launch-guide.md` now documents registration constraints, 400/409 behavior, development-only verification-token behavior, and setup troubleshooting for readiness/database/migration prerequisites.
- The updated documentation is adequate to operate the flow safely without encouraging insecure production behavior.

## Outcome
- **Final outcome:** PASS
