## Documenter Report

### Files Updated
- **`docs/README.md`** — Added the verified-local-auth flow details, one-time hashed email-verification token behavior, session cookie lifecycle, and the stable authenticated-session response contract.
- **`docs/website-launch-guide.md`** — Documented the local auth API routes, session cookie deployment behavior, local-development verification-token behavior, and the new auth environment variable semantics.

### Summary
Updated the architecture and launch documentation to match the implemented and tester-validated Milestone 2 Subtask 2 behavior: Argon2id plus password peppering for local credentials, hashed single-use email verification with login enforcement, server-managed session cookies with expiry and logout revocation, and the stable `{ user, session }` API contract for authenticated session responses.

### Validation
- Reused tester evidence: API lint/typecheck/test/build passed; web lint/typecheck/test passed.
- Documenter rerun: `npx --yes pnpm@10.0.0 install`
- Documenter rerun: `npx --yes pnpm@10.0.0 --filter @sfus/api test`
- Documenter rerun: `npx --yes pnpm@10.0.0 --filter @sfus/web test`

### Documentation Commit
- `387eff27cd18692f64974fda9dbd485c03950df7` — `docs(auth): document local session lifecycle`
