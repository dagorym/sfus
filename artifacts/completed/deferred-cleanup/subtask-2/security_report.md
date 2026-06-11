# Security Report — deferred-cleanup subtask-2

## Scope

Specialist security review of subtask-2: Baseline security headers and CSP at app level.

The web app gained an enforced Content-Security-Policy (not Report-Only) plus
X-Content-Type-Options, Referrer-Policy, X-Frame-Options, and Permissions-Policy on all
routes. The API gained helmet middleware with `strictTransportSecurity: false` and
`contentSecurityPolicy: false`. Thirteen new header assertion tests were added covering
all acceptance criteria.

## Why Specialist Review Was Triggered

Subtask-2 modifies the browser security posture of the web application and the HTTP security
headers emitted by both the web and API services. These are security-critical changes: an
incorrect CSP, a missing header, or an unintentional enforcement-mode downgrade could expose
users to XSS, clickjacking, MIME-sniffing, or information leakage. The plan explicitly
flagged the subtask as requiring Security specialist review.

## Plan and Acceptance Reference

`plans/deferred-cleanup-plan.md`, section "subtask-2 — Baseline security headers and CSP"
(lines 131-160). Five acceptance criteria:

- **AC1**: Every web route responds with the full baseline header set; CSP is enforced (not Report-Only).
- **AC2**: Every API route responds with helmet baseline minus HSTS.
- **AC3**: Core flows pass with zero CSP violations; smoke passes.
- **AC4**: Every CSP allowance beyond `'self'` carries an in-code justification comment.
- **AC5**: No Strict-Transport-Security header emitted by either app.

Upstream verifier result: CONDITIONAL PASS (0 blocking, 2 warnings, 2 notes).

## Findings

### BLOCKING

None.

### WARNING

**W1 — style-src 'unsafe-inline' lacks an in-code justification comment (AC4 partial gap)**
File: `apps/web/next.config.mjs`, line 54

The JSDoc block comment (lines 17–40) documents justifications for `script-src 'unsafe-inline'`,
`connect-src http://localhost:3001`, and `img-src data:` but does not mention `style-src
'unsafe-inline'`. The inline comment at line 52 says only `'unsafe-inline' required for
Next.js 15 hydration scripts` and immediately precedes `script-src`; it does not extend to
the `style-src` line that follows.

The implementer report correctly identifies the justification (Next.js 15 injects inline
styles for CSS modules at runtime), and the allowance is technically sound. This is an
AC4 documentation completeness gap only, not a security regression. No XSS vector is
introduced: the `'unsafe-inline'` in `style-src` does not enable script execution; CSS
injection is a distinct and lower-severity concern. The underlying posture is acceptable;
only the in-code audit trail is incomplete.

**Remediation**: Add a justification comment alongside the `style-src` directive in
`next.config.mjs` (and the JSDoc block) explaining that Next.js 15 CSS module injection
requires `'unsafe-inline'` on `style-src`. Add this to the deferred-tasks entry for CSP
nonce hardening as the correct migration target.

**W2 — docs/operations/deployment.md not updated with HSTS enforcement-point statement**
File: `docs/operations/deployment.md`, line 94

The plan specified that `docs/operations/deployment.md` should be updated to state
explicitly that HSTS is handled at the proxy layer and deliberately omitted from the
application. The Documenter updated `docs/features/web-shell.md` and
`docs/development/api-conventions.md`, but the deployment runbook's Operational Notes
section (line 93–98) describes TLS termination and proxy setup without making the HSTS
ownership explicit.

From a security-operations standpoint this gap matters: an operator reading the deployment
runbook to verify the security posture of a fresh deployment has no single authoritative
statement that HSTS is proxy-owned and does not need to be enabled at app level. The
in-code comments in `next.config.mjs` and `index.ts` compensate but are not visible during
a deployment-only review.

**Remediation**: Add a sentence to `docs/operations/deployment.md` in the Operational
Notes section confirming that HSTS is the nginx reverse proxy's responsibility and is
deliberately omitted from both app layers.

### NOTE

**N1 — AC5 test for API does not directly assert strictTransportSecurity: false option**
File: `apps/api/src/index.test.ts`, line 201

The AC5 test verifies that bootstrap succeeds and `app.use()` is called, but does not
capture the specific option object passed to `helmet()`. The test comment acknowledges this
limitation explicitly. Because helmet itself is not mocked, passing malformed options would
cause helmet to throw and fail bootstrap; the indirect coverage is therefore valid. The
structural audit of `index.ts` confirms `strictTransportSecurity: false` is passed. This
is an acceptable test architecture trade-off for a unit-test boundary, not a security gap.

**N2 — CSP style-src test assertion bundled under hydration justification label**
File: `apps/web/next.config.spec.ts`, line 152

The test name "includes script-src and style-src with 'unsafe-inline' for Next.js hydration"
bundles both directives under the same description. Since `style-src` lacks a separate
in-code justification (W1 above), the test implicitly attributes the same rationale to
both, which is imprecise but not security-harmful. Resolving W1 would also address this note.

**N3 — X-Frame-Options: DENY is set alongside frame-ancestors 'none' in CSP (defense-in-depth)**
File: `apps/web/next.config.mjs`, lines 89–91 and 60

`X-Frame-Options: DENY` and `frame-ancestors 'none'` are both present. Modern browsers
prefer the CSP `frame-ancestors` directive; `X-Frame-Options` covers older browsers that
do not process CSP frame-ancestors. Having both is correct defense-in-depth and is
recommended practice; this is recorded as a positive observation, not a finding.

**N4 — helmet X-Frame-Options default is SAMEORIGIN on the API (not DENY)**
File: `apps/api/src/index.ts`, line 66–73 / `docs/development/api-conventions.md`, line 29

Helmet's default `X-Frame-Options` is `SAMEORIGIN`, not `DENY`. Since the API serves only
JSON, this is acceptable — framing of JSON responses is not a meaningful attack surface.
The web layer uses `DENY` (the stricter value), which is the correct policy for
browser-rendered content. This difference is not a regression and does not require remediation.

## CSP Directive Completeness Assessment

Full directive set in `buildCsp()` (production):

| Directive | Value | Assessment |
|---|---|---|
| `default-src` | `'self'` | Correct restrictive fallback |
| `script-src` | `'self' 'unsafe-inline'` | Justified (Next.js 15 hydration) — see W1 note on style-src |
| `style-src` | `'self' 'unsafe-inline'` | Correct for Next.js CSS Modules; justification comment missing (W1) |
| `img-src` | `'self' data:` | Justified (markdown-renderer.tsx data: URI previews) |
| `connect-src` | `'self'` (prod) / `'self' http://localhost:3001` (dev) | Correct env-conditional; dev allowance scoped to dev only |
| `font-src` | `'self'` | Correct; no external font CDN in use |
| `object-src` | `'none'` | Correct; eliminates Flash/plugin vectors |
| `frame-ancestors` | `'none'` | Correct; prevents clickjacking |
| `base-uri` | `'self'` | Correct; prevents base-tag injection |
| `form-action` | `'self'` | Correct; prevents cross-origin form hijacking |

No `script-src-elem`, `script-src-attr`, `worker-src`, or `manifest-src` overrides are
present; they inherit from `script-src` / `default-src`, which is correct for this
application profile.

The CSP key is `Content-Security-Policy`, confirmed by test assertion in
`next.config.spec.ts` line 41 (`expect(cspHeader!.key).not.toBe("Content-Security-Policy-Report-Only")`).
Enforcement mode is verified.

## HSTS Absence Verification

- **Web app**: No `Strict-Transport-Security` key is present in `securityHeaders`
  (`next.config.mjs` lines 75–98). The `next.config.spec.ts` test at line 95 asserts
  `findHeader(headers!, "Strict-Transport-Security")` returns `undefined`.
- **API**: `helmet({ strictTransportSecurity: false })` is confirmed in `index.ts` line 69.
  The architecture decision at `docs/architecture/milestone-1-foundation-decisions.md` line
  118 references the locked baseline security-header direction; in-code comments in both
  `next.config.mjs` (line 74) and `index.ts` (line 68–69) reference this decision
  explicitly.
- The HSTS enforcement point (nginx reverse proxy) is documented in `web-shell.md` and
  `api-conventions.md` but not in the deployment runbook (W2).

## Enforcement vs. Report-Only Verification

The CSP header key is `Content-Security-Policy` (enforced). No `Content-Security-Policy-Report-Only` header is present in the headers array. The test suite explicitly asserts both conditions. No `report-uri` or `report-to` directives are included in the CSP value; the policy is purely enforcing with no bypass reporting channel.

## Per-Allowance Justification Audit (AC4)

| Allowance | In-code comment present | Documentation present |
|---|---|---|
| `script-src 'unsafe-inline'` | Yes (JSDoc block + inline comment) | Yes (web-shell.md) |
| `style-src 'unsafe-inline'` | **No** (W1) | Yes (web-shell.md omits explicit mention) |
| `img-src data:` | Yes (JSDoc block + inline comment) | Yes (web-shell.md) |
| `connect-src localhost:3001` (dev) | Yes (JSDoc block) | Yes (web-shell.md) |
| `contentSecurityPolicy: false` (API) | Yes (block comment, index.ts) | Yes (api-conventions.md) |
| `strictTransportSecurity: false` (API) | Yes (block comment, index.ts) | Yes (api-conventions.md, web-shell.md) |

## Regression Assessment

No new XSS, CSRF, or clickjacking vectors were introduced:

- `'unsafe-inline'` on `script-src` is a pre-existing constraint of Next.js 15 without a
  custom server; it is not a regression introduced by this change.
- `img-src data:` is scoped to data URIs only; no external image host is opened.
- The dev-only `connect-src` allowance is conditional on `NODE_ENV === "development"` and
  does not appear in production.
- Helmet defaults on the API do not include any permissive headers; the only disabled defaults
  are HSTS and CSP, both deliberate and documented.
- `X-Frame-Options: DENY` replaces whatever browser default was in place before (no header);
  this reduces clickjacking risk, not increases it.
- `X-Content-Type-Options: nosniff` adds MIME-sniffing protection.

## Test Sufficiency Assessment

The 13 new tests (11 in `next.config.spec.ts`, 2 in `index.test.ts`) cover the critical
security-observable properties:

- **AC1 (web baseline headers)**: All five headers verified by name in production mode.
- **AC1 (CSP enforcement mode)**: Direct key assertion confirms `Content-Security-Policy`
  not `Content-Security-Policy-Report-Only`.
- **AC1 (all routes)**: Source pattern `/(.*)`  verified.
- **AC4 (per-allowance)**: Dev vs. production `connect-src` difference verified; `unsafe-inline`
  and `data:` presence verified.
- **AC5 (no HSTS on web)**: Direct absence assertion.
- **AC2 (helmet registered before routing)**: Invocation-order assertion in `index.test.ts`.
- **AC5 (API HSTS disabled)**: Indirect via bootstrap-success; acceptable for unit-test
  boundary (see N1).

Missing direct coverage: no test directly asserts `strictTransportSecurity: false` is passed
to helmet (N1). This is an accepted limitation of the mock architecture. The structural audit
and bootstrap-success validation together provide adequate confidence.

Test sufficiency is **adequate** for the stated acceptance criteria.

## Documentation Sufficiency Assessment

- `docs/features/web-shell.md`: Accurate and complete for web-layer headers and CSP. Correctly
  states HSTS is proxy-managed.
- `docs/development/api-conventions.md`: Accurate and complete for API helmet configuration.
  Correctly references the web-layer CSP and the locked deployment decision.
- `docs/operations/deployment.md`: Does not include the HSTS enforcement-point statement
  required by the plan (W2). The omission creates a minor operational documentation gap but
  does not misrepresent any security property.

Documentation sufficiency is **adequate with a completeness gap** (W2).

## Final Outcome

**CONDITIONAL PASS**

No blocking security findings. The CSP directives are complete and correctly scoped. Enforcement
mode is verified. All five baseline headers are applied to all web routes. HSTS is absent from
both app layers per the locked deployment decision. Helmet is correctly configured on the API.
No new attack vectors were introduced.

Two warnings remain from the verifier (W1: `style-src` missing in-code justification; W2:
deployment.md HSTS statement incomplete) and are confirmed by specialist review. These should
be addressed in the same cleanup cycle or tracked as follow-up before the final reviewer pass.
They do not block safe rollout.
