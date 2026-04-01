# Reviewer Report

- Feature plan: `plans/milestone-1-foundation-plan.md`
- Architecture decisions: `docs/architecture/milestone-1-foundation-decisions.md`
- Branch reviewed: `ms1`
- Artifacts reviewed: `artifacts/milestone-1-foundation/subtask-{1,2,3,4,5}`
- Review mode: feature-level, read-only except reviewer artifacts

## Review scope
Reviewed the combined implementation, tests, documentation, and verifier outputs for all five Milestone 1 Foundation subtasks. Compared the merged `ms1` branch state against the governing plan and locked architecture decisions, with extra attention to cross-subtask integration: monorepo/tooling, env contracts, Compose topology, API foundation, frontend shell, smoke validation, CI/CD, deployment docs, and rollback guidance.

## Overall completeness assessment
Milestone 1 Foundation is substantially delivered and the accepted verifier outputs show the implementation is stable across the planned subtasks, including the final same-worktree smoke-validation remediation for Subtask 5. Core feature goals are met:

- `pnpm` monorepo with `apps/web`, `apps/api`, and `packages/config`
- hybrid local development plus full-stack Compose validation
- production-oriented single Compose topology with explicit one-off migration service
- Nest API foundation with strict env validation, JSON logging, correlation IDs, `/api` prefix, health endpoints, Swagger gating, and explicit migrations
- Next.js frontend shell with static homepage, branded `404`, branded error page, minimal nav/footer, and `/api` rewrite contract
- lightweight test baselines, CI/CD validation updates, smoke validation, deploy and rollback documentation

However, two plan-level requirements remain only partially addressed and should be treated as follow-up work before calling the milestone fully closed.

## Findings

### WARNING

1. **Trusted proxy behavior is not explicitly configured for the documented reverse-proxy topology.**  
   - **Plan / decision reference:** `plans/milestone-1-foundation-plan.md:217-225`, `docs/architecture/milestone-1-foundation-decisions.md:117`  
   - **Evidence:** no explicit trusted-proxy configuration was found in the API bootstrap or module wiring (`apps/api/src/index.ts`, `apps/api/src/app.module.ts`, `apps/api/src/database/database.module.ts`), and repo searches for `trust proxy` / proxy trust configuration returned no matches in the implementation or docs.  
   - **Why it matters:** the milestone explicitly locked proxy trust behavior to the expected reverse-proxy topology only. Leaving it implicit makes the production request-header contract under `nginx-proxy` undocumented in code and harder to reason about for future auth, rate limiting, IP logging, and security-sensitive middleware.

2. **The Milestone 1 security-header/CSP baseline is documented as in scope but not implemented or specified concretely.**  
   - **Plan / decision reference:** `plans/milestone-1-foundation-plan.md:109-112`, `docs/architecture/milestone-1-foundation-decisions.md:118`  
   - **Evidence:** no CSP or baseline security-header implementation was found in the frontend or API runtime configuration (`apps/web/next.config.mjs`, `apps/api/src/index.ts`), and searches for `Content-Security-Policy`, `helmet`, `X-Frame-Options`, `Referrer-Policy`, or related headers returned no implementation matches. The deployment docs also do not define where those headers are enforced.  
   - **Why it matters:** this is a locked Milestone 1 expectation, not a future-feature concern. Without a concrete baseline, the delivered stack lacks the documented minimum hardening direction for the first public deployment.

### NOTE

1. **No additional material cross-subtask gaps were identified beyond the proxy/security baseline items above.**  
   - Accepted verifier results across Subtasks 1-5 are consistent with the merged branch state.  
   - The final Subtask 5 remediation satisfactorily closed the same-worktree smoke-repeatability issue and validated sequential plus parallel smoke execution with cleanup.

## Edge cases and integration review
- Frontend `/api` targeting and local rewrite behavior align with the API route contract and were covered by implementation plus smoke validation.
- API readiness correctly checks DB connectivity and reviewed migration state; migration execution remains explicit and separate from normal startup.
- Production Compose topology, host-managed env model, and rollback documentation are internally consistent.
- No evidence of scope creep into deferred Milestone 2+ domains (auth UI, search, Redis, placeholder pages, browser E2E).

## Follow-up feature requests
1. **Implement explicit trusted-proxy configuration for the API that matches the Milestone 1 reverse-proxy topology, and document the expected forwarded-header contract used in production.**
2. **Implement and document the Milestone 1 baseline security-header/CSP policy, including where enforcement lives (application layer and/or reverse proxy) and any required exceptions for Swagger or other in-scope surfaces.**

## Final outcome
**CONDITIONAL PASS**

The feature is substantially complete and operationally validated, but the locked Milestone 1 proxy-trust and security-header/CSP expectations are not fully satisfied in the merged implementation. Follow-up planning is required to close those gaps.
