Verifier Report

Scope reviewed:
- ST2 — Topic last-reply author enrichment + shared 'last activity' primitive (API). Full Implementer→Tester→Documenter→Security chain reviewed.
- Implementer: apps/api/src/forums/forums.types.ts (PublicTopicShape.lastPostAuthor field), apps/api/src/forums/forums.service.ts (toTopicShape second param; new resolveTopicLastActivityAuthors; listTopics call chain).
- Tester: apps/api/src/forums/forums.service.test.ts (32 new ST2 tests covering resolveTopicLastActivityAuthors and listTopics lastPostAuthor).
- Documenter: docs/features/forums.md (lastPostAuthor field semantics, null cases, privacy contract, batched resolution note).
- Security: specialist security review ran (branch forums-listing-st2-security-20260610) — CONDITIONAL PASS. Security criteria all passed. Three non-security validation-gate findings forwarded to this verifier for independent confirmation (W1 lint, W2 test suite, W3 primitive contract gap).
- Verifier independently ran lint, typecheck, and the API forums unit suite against the worktree's ST2 code to confirm or refute W1/W2/W3.

Acceptance criteria / plan reference:
- plans/forums-listing-enhancements-and-fixes-plan.md — ST2 section (lines 229-318) and acceptance criteria (lines 242-254).
- Acceptance criteria: lastPostAuthor field on topic items; null when no non-deleted replies; soft-deleted posts ignored; resolveTopicLastActivityAuthors primitive exists; board visibility oracle parity unchanged; lint/typecheck/API suite pass.

Convention files considered:
- AGENTS.md
- docs/development/testing.md (validation gate commands)
- docs/features/forums.md (feature contract)
- .myteam/verifier/role.md

Findings

BLOCKING
- apps/api/src/forums/forums.service.ts:514 - Lint FAILS: 'openingAuthors' is defined but never used (@typescript-eslint/no-unused-vars); npx pnpm lint exits non-zero.
  Independently confirmed: `npx --yes pnpm@10.0.0 lint` exits non-zero — 1 error at forums.service.ts:514. The openingAuthors parameter in resolveTopicLastActivityAuthors is declared but never read. The plan's acceptance criterion 'lint passes' is not met. Root cause: the opening-author fallback was never implemented, so the parameter has no consumer. Must be fixed (remove param or implement the fallback) before merge.
- apps/api/src/forums/forums.service.test.ts:1260-1299 (TC11); root cause: apps/api/src/forums/forums.service.test.ts:36-53 - API unit suite FAILS: 1 failed / 165 passed. TC11 throws TypeError: this.postRepository.createQueryBuilder(...).select is not a function.
  Independently confirmed: running vitest against the worktree's ST2 code reports 1 failed / 165 passed. TC11 ('returned topic shapes lack internal fields') uses makeForumsService() with a topic-repo stub returning 1 topic but uses the default createMinimalRepository() post-repo stub. The shared qbStub (lines 36-53) only stubs ['leftJoinAndSelect','where','andWhere','orderBy','addOrderBy','take','getMany'] and does not include select/addSelect/innerJoin/getRawMany. listTopics always calls resolveTopicLastActivityAuthors, which calls .select() on the stub, throwing TypeError. The tester's PASS claim was based on running pnpm against the main sfus workspace (pre-ST2 code), not the worktree's ST2 implementation, producing a false PASS. The createMinimalRepository qbStub must be extended, or TC11 must be updated to use a makeServiceWithPostQb helper with a proper raw QB stub.

WARNING
- apps/api/src/forums/forums.service.ts:504-554 - W3 CONFIRMED: resolveTopicLastActivityAuthors ignores openingAuthors; always returns null for no-reply topics. ST3 depends on this primitive for opening-author fallback.
  The plan's implementer prompt (plan lines 289-291) requires the primitive to fall back to 'the opening post's author + createdAt' when no non-deleted reply exists. ST3's acceptance criteria (plan line 339-340) explicitly state lastPost.author is resolved via the ST2 primitive for opening-post fallback. As built, the primitive returns null for all no-reply topics regardless of the openingAuthors parameter. For ST2's own acceptance criteria ('null when no non-deleted replies') this is correct. However ST3 would silently receive null instead of the opening-post author for reply-free topics, breaking ST3's last-post-author display. This is WARNING for ST2 (ST2's own ACs are satisfied) but must be resolved before or during ST3. Both this WARNING and the BLOCKING lint error share the same root cause: openingAuthors is declared but never consumed.

NOTE
- apps/api/src/forums/forums.service.test.ts:2912-2918 - ST2 tests correctly assert toBeNull() for no-reply topics with openingAuthors populated — codifies null-return as intended ST2 behavior.
  Correct for ST2 acceptance criteria but encodes unimplemented fallback as correct. ST3 tests and this test file will need updates when ST3 adds opening-author fallback support. No action needed for ST2 alone.
- apps/api/src/forums/forums.service.ts:527-533 - Tie-break non-determinism: two non-deleted posts with identical created_at yield non-deterministic last-reply author (both candidates are valid, non-deleted participants).
  Carried from security review NOTE. Not a correctness or security defect — both candidates are legitimate non-deleted participants. No acceptance criterion requires deterministic tie-break ordering. Mentioned for completeness; future hardening could add secondary ORDER BY u.id.

Test sufficiency assessment:
- INSUFFICIENT for clean merge. 1 of 166 tests fails (TC11). The 165 passing tests — including 32 new ST2 tests covering resolveTopicLastActivityAuthors method directly and listTopics end-to-end via makeServiceWithPostQb — adequately cover the security-relevant acceptance criteria: soft-delete filter assertion, null fallback for no replies and all-soft-deleted, non-null reply author when replies exist, oracle-parity 404 for nonexistent and members-gated boards, author shape excludes email/globalRole.
- The single failing test is TC11, a pre-existing listTopics shape test whose mock was not updated to stub the new select/addSelect/innerJoin/getRawMany QB methods now exercised by the resolveTopicLastActivityAuthors call path. The fix is to extend createMinimalRepository qbStub or provide a raw QB override for TC11.

Documentation accuracy assessment:
- ACCURATE for implemented behavior. docs/features/forums.md correctly documents lastPostAuthor field semantics (non-deleted reply author or null), null conditions (no replies or all soft-deleted), privacy contract (username/displayName only, no email/globalRole), batched resolution (no N+1), and defense-in-depth note for listRecentTopics.
- Plan/doc-vs-implementation gap on W3: the plan requires the primitive to fall back to opening-post author for no-reply topics; both the implementation and the docs consistently document null return (docs match code, not plan). This is consistent with the W3 WARNING.

Artifacts written:
- artifacts/forums-listing-enhancements-and-fixes/ST2/verifier_report.md
- artifacts/forums-listing-enhancements-and-fixes/ST2/verifier_result.json

Verdict:
- FAIL
