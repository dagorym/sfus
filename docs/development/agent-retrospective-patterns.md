# Agent Retrospective Patterns

Recurring failure patterns distilled from every verifier and reviewer report across the
completed plans in `artifacts/completed/` (Milestone 1 → MS3 review closeout, plus the
auth-follow-up and CI/CD plans). Each pattern caused at least one remediation loop, a
CONDITIONAL PASS, or a defect that escaped to a later plan.

**How to use this document:**

- **Planner:** consult the "Planner" guidance while decomposing work and writing
  implementer prompts; several patterns are prevented only by what the plan says.
- **All other roles:** read the checklist for your role before starting a subtask. These
  are the mistakes your role has actually made in this repository, not hypotheticals.
- This doc records process patterns, not product behavior. Product contracts live in the
  feature docs (see the [routing table](../README.md)).

---

## P1. Docs and code drift — claims outrun implementation

The most frequent finding class (~14 instances). Variants: feature docs claiming behavior
that was never implemented (the MS1 trusted-proxy decision doc claimed configuration that
still does not exist; `docs/README.md` once claimed *all* Markdown write paths were
sanitized while only comments were); JSDoc describing guarantees the code doesn't make (a
create() documented as FK-ordered but silently non-transactional; a nav JSDoc claiming
top-level slug routes were publication-checked when only `/blog/*` and `/pages/*` were);
Swagger decorators left stale after a behavior change (403→404 contract change shipped
with the old `@ApiForbiddenResponse` text); response-shape docs listing fields the mapper
omits.

- **Implementer:** when you change behavior, update the in-code surfaces in the same
  commit: JSDoc, Swagger/OpenAPI decorators, inline comments stating invariants. Treat a
  stale decorator as a failing test.
- **Documenter:** verify every claim against the code before writing it ("Writing
  documentation" rule in the routing table). Grep for the feature's key terms across the
  whole docs tree — adjacent stale claims in a file you are already editing are still
  yours to fix.
- **Verifier:** diff doc claims against code, not against the implementer's report.
  Explicitly check JSDoc and Swagger decorators on every changed public method.

## P2. Plan-requirement → subtask-AC traceability gaps

Locked plan-level requirements that were never mapped to any subtask's acceptance
criteria were silently dropped, and no per-subtask verifier could catch the omission —
only the final reviewer did, or nobody. Examples: MS1 trusted-proxy and CSP baseline
(locked decisions, never implemented, open for four milestones); the subtask-2 verifier's
explicit instruction that subtasks 3–5 "must wire" the Markdown sanitizer (dropped by two
of three downstream subtasks); plan-mandated deferred-scope register entries omitted.

- **Planner:** every plan-level requirement, locked decision, and risk mitigation MUST
  appear in at least one subtask's acceptance criteria — do a final traceability pass
  before validation. When a verifier or earlier subtask establishes a precondition for a
  later subtask, restate it verbatim in the later subtask's implementer prompt; never
  rely on downstream agents reading earlier reports.
- **Coordinator:** when a stage report directs "subtask N must do X", confirm X is in
  subtask N's prompt before launching it; if not, surface to the planner/user.
- **Reviewer:** check feature-level ACs and locked decisions directly against code, not
  only against per-subtask verdicts — per-subtask PASS does not compose into
  plan-requirement coverage.

## P3. Tests mirror the implementation instead of the contract

Tests written to what the code does, not what the requirement says — so broken behavior
passed green. Examples: a GitHub-Actions annotation test asserting the `::warning::`
token on **stderr** because that's where the (broken) implementation wrote it (Actions
parses stdout); a fully mocked call-order test where the plan explicitly mandated a
schema-enforced integration test (the same mock-only style had let the original FK bug
ship); security predicate pins that assert a `publishedAt` key exists but not the
`LessThanOrEqual` operator; happy-path-only suites for auth flows whose ACs were all
about negative paths; web "tests" that grep source text instead of executing behavior.

- **Tester:** derive assertions from the acceptance criteria and platform contract, never
  from reading the implementation. Pin security predicates by operator type, not shape.
  When the plan mandates an integration-style proof, a mock is not a substitute — say so
  rather than delivering a weaker artifact. Cover the negative paths the AC names.
- **Verifier:** for each AC, ask "would this suite fail if the behavior regressed?" — a
  passing suite that mirrors the defect is itself a finding.
- **Planner:** when a risk mitigation requires a specific test *kind* (integration,
  executed-runtime, operator-pinned), name it in the subtask AC so a weaker substitute is
  an objective failure.

## P4. Validation matrix not fully run before handoff

Implementers reporting success without running the full validation set: lint skipped
(unused import and `no-img-element` failures reached the tester); web lint *falsely
reported as PASS* by an implementer when it failed; the API `tsc` build never run, so
`import.meta.url` (legal under vitest's esbuild, fatal under NodeNext CJS `tsc`) broke
the build **twice** in one plan.

- **Implementer / Tester:** run every command in `docs/development/testing.md` scoped to
  your change — test, lint, typecheck, AND the API `tsc` build — before reporting
  success. Never report a command you did not run; never report PASS from memory.
- **Verifier:** re-run the validation matrix yourself; treat "implementer says it
  passed" as unverified input.

## P5. Toolchain split-brain: vitest vs tsc, cwd, worktrees

Code that passes the dev runner but fails the real build or another environment:
`import.meta.url` under the CJS build (twice); `process.cwd()`-based test fixture paths
that double the path under a different cwd (6 phantom test failures eroded suite signal
for an entire plan, training every role to hand-wave failures); pnpm resolving vitest
from the parent worktree and skewing test counts.

- **Implementer / Tester:** the API builds as CommonJS (NodeNext) — no `import.meta` in
  API code or tests; resolve fixture paths with `__dirname`, never `process.cwd()`.
  After env-dependent failures, run `pnpm install` in the worktree before debugging.
- **Everyone:** "N pre-existing failures, unrelated" is a debt that hides regressions.
  If the suite is not fully green, flag it loudly instead of normalizing it.

## P6. Mandated security stage skipped

In three separate plans, subtasks marked "Security review required: yes" completed their
whole chain with no specialist security stage and no recorded waiver; gaps were found
only at final review (or later), and the retroactive reviews then surfaced real
CONDITIONAL-PASS warnings. The media subsystem went unreviewed entirely (now in the
deferred register).

- **Coordinator:** before recording a security-marked subtask complete, check
  `security_report.md` + `security_result.json` exist; if the stage is consciously
  skipped, record an explicit waiver in the subtask artifacts.
- **Verifier:** for security-marked subtasks, missing security artifacts are a WARNING,
  not a note.
- **Planner:** repeat the security-required marking inside the implementer prompt itself
  so every downstream agent sees it without consulting the plan.

## P7. Partial-breadth fixes — pattern fixed at one call site, missed at the rest

A fix applied to the first instance of a pattern while sibling call sites kept the bug:
the error-envelope fix applied to 1 of 16 blog-client reads (and dropped entirely for all
8 pages-client reads); the reserved-slug list updated on the API side while the web
mirror drifted (10 vs 11 entries). Cross-workspace mirrors (API/web constant pairs) are
especially prone.

- **Planner:** when a subtask fixes a recurring pattern, enumerate the call sites in the
  prompt (count them) and write the AC as "all N sites" — and include both sides of any
  API/web mirror in the allowed-file list.
- **Implementer:** grep for every instance of the pattern you are fixing before declaring
  done; state the count in your report.
- **Tester / Verifier:** verify the *absence* of the old pattern (e.g., "zero
  `payload?.message`-only reads remain"), not just the presence of the new one at the
  sites the implementer mentions.

## P8. Scope dropped or deferred without a recorded register entry

In-flight scope drops that almost got lost: a coordinator deferred explicit subtask scope
(pages-client envelope fix) with no entry in `docs/deferred-tasks.md`; a verifier cited a
register entry that did not exist ("phantom deferral") to justify accepting a residual.

- **Coordinator:** any in-flight scope reduction must be stated in the subtask result
  artifacts AND queued for the next planning cycle's register update.
- **Verifier / Security:** when citing `docs/deferred-tasks.md`, open it and quote the
  line — never cite the register from memory.
- **Planner:** start each planning cycle by sweeping recent reviewer follow-ups and
  coordinator deferrals into the register (it is editable only in planning cycles).

## P9. Hand-rolled parsing and shell edge cases

The CI/CD plan's defects all clustered here: a hand-rolled YAML parser that missed inline
maps, then missed trailing comments in the remediation of that very finding; arithmetic
`(( ))` aborting under an inherited `bash -e`; smoke scripts not repeatable (fixed
container names, shared mutable `.env` state, port collisions across concurrent runs).
Remediations verified only against the exact reported reproduction failed again on the
adjacent variant.

- **Implementer:** when parsing structured formats in shell, enumerate format variants
  (inline/block, comments, indentation) or use a real parser; write scripts to survive
  `bash -e` and concurrent invocation from the same worktree.
- **Tester:** test the input-format *class*, not the single reproduction from the bug
  report.

## P10. Multi-write operations without transactions

Registration once wrote four rows non-transactionally (mid-sequence failure stranded a
partial account that blocked re-registration); pages `create()` shipped a sequential
three-step save against an explicit "transactional" AC, leaving orphaned slug-occupying
rows on failure, and its tests (mocked) could not have caught it.

- **Implementer:** any operation writing multiple rows that must remain consistent wraps
  them in `repository.manager.transaction`; if you ship without one against an AC that
  says "transactional", you have not met the AC — say so rather than reinterpreting it.
- **Planner:** for new multi-write features, state the atomicity requirement in the AC
  and require a schema-enforced (DB-gated integration) proof, not a mock (see P3).

## P11. Verifier discipline: diff bases, unverified assumptions, lost history

Verifier-side process faults that caused churn or destroyed evidence: a false-positive
WARNING from diffing against the wrong base (post-sibling-subtask HEAD instead of the
merge base) forced a needless remediation loop; a severity was misclassified on an
unverified routing assumption (assumed an `apps/web/app/pages/page.tsx` existed; it
didn't — security had to escalate); early plans overwrote FAIL reports in place, leaving
one subtask with a FAIL verdict-of-record whose closure no QA artifact ever confirmed.

- **Verifier:** compute the merge-base explicitly before diffing; verify environmental
  assumptions (routes, files, configs) by looking, before they decide a severity; after
  a remediation pass, write a superseding report and archive the old one under
  `history/` (the closeout-plan convention) — never overwrite.
- **Coordinator:** ensure every remediation loop ends with a superseding verifier
  artifact, and archive prior passes under `history/`.

## P12. Visibility predicates and existence oracles

The dominant *security* finding class across MS3: every content lookup path must enforce
the full public-visibility predicate (`status = 'published'` AND `publishedAt <= now`)
and unauthorized lookups must be indistinguishable from nonexistent ones. Recurrences:
listComments' UUID fallback checking status but not `publishedAt` (leaked scheduled-post
existence; flagged three times before being fixed); nav filtering applied on the public
path but not the authenticated path (metadata leak); comment creation returning 403
("exists but hidden") vs 404 ("doesn't exist"); distinct 400 messages confirming foreign
UUIDs exist.

- **Implementer:** route every visibility check through the shared predicate helpers
  (e.g. `findPublishedById`/`findPublishedBySlug`) instead of re-deriving partial
  predicates; new fallback/alternate lookup paths inherit the *full* predicate. Error
  responses on gated paths must not distinguish hidden-from-nonexistent (404 parity,
  uniform messages).
- **Tester:** add oracle-parity tests (identical class + message across
  nonexistent/draft/unpublished/future-scheduled) and operator-pinned predicate
  assertions for every new lookup path.
- **Security / Planner:** treat any new read path touching publishable content as
  security-relevant scope by default.
