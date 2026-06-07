# Security Report — deferred-cleanup subtask-1: API trusted-proxy configuration

## Review scope

Specialist security review of the trusted-proxy implementation for the API bootstrap function.
Security review was explicitly required by the plan (`plans/deferred-cleanup-plan.md` line 108:
"Security review required: yes — trust boundary; forwarded-header handling").

Review surface:
- `apps/api/src/index.ts` — Express `trust proxy` configuration in `apiBootstrap`
- `apps/api/src/auth/auth.controller.ts` — all `request.ip` audit-log call sites
- `apps/api/src/index.test.ts` — tester's trust proxy behavioral test
- `docs/operations/deployment.md` — operational note on proxy configuration
- `docs/features/auth.md` — audit-log IP semantics section
- Production topology: `cicd/docker/compose.prod.yml`

## Why specialist review was triggered

The change modifies how Express resolves the client IP from HTTP headers injected by a reverse
proxy. Trust boundary misconfiguration (e.g., trusting too many hops or trusting all proxies)
could allow an attacker to spoof their apparent IP address as recorded in audit logs, and
could affect `X-Forwarded-Proto` resolution used for the `Secure` cookie flag decision.

## Governing plan / acceptance reference

`plans/deferred-cleanup-plan.md` subtask-1, lines 116–126. Acceptance criteria:
1. App sets `trust proxy` for a single trusted hop, matching the documented contract.
2. Behind one simulated proxy hop, `request.ip` resolves the original client IP from `X-Forwarded-For`.
3. All auth audit-log call sites recording `request.ip` receive the forwarded client IP with zero call-site changes.
4. Direct (un-proxied) local dev and smoke validation flow still work unchanged.
5. JSDoc/comments updated; no stale "not configured" claims remain.

---

## Findings

### BLOCKING

None.

### WARNING

None.

### NOTES

**NOTE-1: IP address is audit-log only; no access-control decisions depend on it**
- Files: `apps/api/src/auth/auth.controller.ts` lines 74, 103, 124, 138, 152, 163, 191, 279, 312
- All 9 call sites use the pattern `ipAddress: request.ip || null` to populate audit-log and session
  metadata only. No code path uses the resolved IP to gate authentication, authorization, or any
  security-relevant decision. An adversarial client that forges an `X-Forwarded-For` header before
  reaching nginx-proxy would get a fake IP recorded in the session/audit row; this is an audit
  integrity concern, not an authentication or authorization bypass.
- Assessment: Acceptable for the documented use case (audit logging). No fix required unless a
  future feature introduces IP-based access control, at which point the caller would need to reason
  about XFF reliability independently.

**NOTE-2: JSDoc cites pre-documenter wording of deployment.md (cosmetic, carried forward from verifier)**
- File: `apps/api/src/index.ts` lines 34–38
- The JSDoc quotes the old line 94 text of `docs/operations/deployment.md`. The documenter updated
  that line to more precise wording. The citation remains accurate as a source reference and the
  architectural intent is correctly documented. No correctness impact.

---

## Trust boundary analysis

### Configuration correctness

`app.getHttpAdapter().getInstance().set("trust proxy", 1)` (index.ts:44) uses the integer `1`,
which tells Express to trust exactly one upstream proxy hop. Under this setting Express strips the
rightmost entry from `X-Forwarded-For` (added by the trusted proxy) and returns the next entry as
`request.ip`. This is the correct and minimal configuration for a single-hop nginx-proxy topology.

Using `true` instead of `1` would trust all `X-Forwarded-For` entries unconditionally,
allowing any client to claim any IP. The integer value `1` is confirmed by the test at
`index.test.ts:192` (`expect(trustProxyCall![1]).toBe(1)`).

### Production topology alignment

`cicd/docker/compose.prod.yml` confirms:
- The `api` service is attached to the `sfus` and external `nginx-proxy` Docker networks.
- No host port bindings — all inbound traffic arrives through nginx-proxy.
- The `migrate` service is on the `sfus` network only (no proxy exposure).
- There is exactly one intermediary hop (nginx-proxy) between the internet and the api container.

The `trust proxy = 1` configuration matches the production topology exactly. There is no
multi-proxy intermediary that would cause the setting to consume legitimate XFF entries.

### IP spoofing attack surface

With `trust proxy = 1`:
- A client that sends `X-Forwarded-For: <forge>` to nginx-proxy: nginx-proxy appends the real
  client IP, so Express sees `X-Forwarded-For: <forge>, <real>`. Express strips `<real>` (the
  trusted-proxy entry) and returns `<forge>` as `request.ip`. The forge is recorded in the audit
  log.
- A client that connects directly to the api port (bypassing nginx-proxy): the api has no host
  port binding in production, so this is not reachable from the internet. In local development the
  socket remote address is used directly (no proxy), which is correct.

Impact of IP forge: audit log records a false client IP. No authentication, authorization, MFA,
session validity, or cookie-security decision depends on this value. Risk is limited to audit log
integrity.

### `X-Forwarded-Proto` and Secure cookie behavior

With `trust proxy = 1`, Express also resolves `req.protocol` from `X-Forwarded-Proto`. The
`Secure` cookie flag is set based on `NODE_ENV === "production"` (auth.controller.ts lines 324,
336, 344, 352) — not on `req.protocol` — so this resolution path does not affect cookie security
in the current implementation.

---

## Test sufficiency assessment

SUFFICIENT for the risk surface.

The new test (`index.test.ts:177-198`) verifies:
1. `set("trust proxy", 1)` is called on the Express adapter (not a NestJS abstraction).
2. The value is exactly the integer `1` — not boolean `true`, not a string, not a broader range.
3. The call precedes `setGlobalPrefix` (ordering guarantee).

The test uses the mock pattern consistent with the existing suite. The mock correctly intercepts
the actual `getHttpAdapter().getInstance().set(...)` call path.

AC2 ("request.ip resolves from X-Forwarded-For behind one proxy hop") is validated by the test
asserting the correct Express setting. A live integration test against a real Express instance with
a crafted `X-Forwarded-For` header would provide stronger behavioral evidence, but the plan does
not require it and the unit test adequately demonstrates the configuration is applied.

---

## Documentation sufficiency assessment

ACCURATE AND SUFFICIENT.

- `docs/features/auth.md` — new "Audit logging and client IP" section correctly describes 9 call
  sites, `trust proxy = 1`, nginx-proxy topology, local dev fallback, and provides cross-references
  to implementation and architecture decision.
- `docs/operations/deployment.md` — operational notes section accurately states that Express
  `trust proxy = 1` is configured for the single shared nginx-proxy hop and references the locked
  architecture decision.
- `docs/architecture/milestone-1-foundation-decisions.md` line 117 — the locked decision ("Trusted
  proxy behavior is explicitly configured for the expected reverse-proxy topology only.") is
  satisfied by the implementation.

---

## Acceptance criteria evaluation

| AC | Status | Evidence |
|----|--------|----------|
| AC1: trust proxy set for single hop | PASS | `index.ts:44` sets `("trust proxy", 1)`; test asserts value is exactly integer 1 |
| AC2: request.ip resolves from XFF behind one hop | PASS | Test verifies correct Express setting is applied; Express behavior for value=1 is well-defined |
| AC3: all 9 call sites receive forwarded IP, zero changes | PASS | Grep confirms 9 sites in auth.controller.ts; all use `request.ip \|\| null`; no call-site changes |
| AC4: direct local dev unchanged | PASS | Express falls back to socket remote address when no XFF header present; documented in JSDoc and auth.md |
| AC5: JSDoc updated, no stale "not configured" claims | PASS | index.ts JSDoc fully documents the locked decision and topology |

---

## Outcome

**PASS**

All acceptance criteria are met. The trust-proxy configuration is correctly scoped to a single hop,
matches the production topology, and the risk surface (audit-log IP only, no access-control
dependency) is appropriate and documented. No blocking or warning-level security findings identified.
