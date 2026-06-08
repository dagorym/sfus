Reviewer Report

Feature plan reviewed:
- plans/milestone-4-forums-plan.md (Milestone 4 - Forums; governing scope/acceptance source). Feature: site-wide forums (Categories -> Boards -> Topics -> Posts), member authoring via shared Markdown editor + image pipeline, global moderator/admin pin/lock/move, quoting, pagination, @username mentions + minimal public profile, user avatars, and a new server-side rate-limit/anti-spam layer also protecting blog comments; plus folded-in identity/media/anti-abuse/web/test fixes. 18 subtasks ST1-ST18; Risk register R1-R9; Decisions D1-D9/AV1-AV3.
- Source-of-truth design: star_frontiers_rpg_website_design.md (sections 5.2, 9/18, 13, 14).

Inputs reviewed:
- Governing plan plans/milestone-4-forums-plan.md (full: feature restatement, 18 subtask scopes+ACs, security markers, dependency ordering, doc-impact, Risk register R1-R9, decisions D1-D9/AV1-AV3).
- All 18 merged subtask artifact sets under artifacts/milestone-4-forums/ST1..ST18 (implementer/tester/documenter/[security]/verifier reports + result JSONs, plus */history where remediations occurred).
- Verifier verdicts: all 18 PASS, 0 blocking findings across the feature (ST6 1 WARNING doc-prose; ST8 1 WARNING; rest WARNING=0).
- Security reviews: present for every plan-marked subtask ST2,3,4,5,6,7,8,9,11,12,14,15,16,17 (14/14) and correctly absent for the non-marked ST1,10,13,18. 0 blocking findings in any; ST8 and ST14 CONDITIONAL PASS (single accepted non-blocking WARNING each); ST16 stored-XSS confirmed closed across three security passes.
- Merged code spot-checks on branch ms4: forums.service.ts (15 evaluate()/gate call sites; normalizeMarkdownBody->validateMarkdownBody at both write paths; assertModerationAccess + pin/lock/move with evaluate()-re-validated move); forums.controller.ts + blog.controller.ts (exceedsLinkLimit + throttleService.checkRequest at all 3 forum write paths and the blog-comment path); media.service.ts (imageMagicBytesMatch across all 4 resourceTypes incl. avatar, avatar/ prefix + avatar size cap); users.service.ts (setAvatar enforces resourceType=='avatar' AND ownerUserId==caller with a single non-oracle error; suggest 3-field + profile 5-field allowlists; avatar resolved to /api/media/<id>); web markdown-renderer.tsx (sanitizeUrl reject set, dangerouslySetInnerHTML only via the sanitizer); forums/users web surfaces (usernames encodeURIComponent-encoded throughout; mention-autocomplete has no dangerouslySetInnerHTML); user-avatar.tsx resolveAvatarSrc; pages.service.integration.test.ts (currentRevision relation exercised).
- Feature docs: docs/features/forums.md (+ row in docs/README.md routing table), media.md, auth.md, web-shell.md, blog.md, development/api-conventions.md, operations/launch.md, guides/content-management.md.
- Validation matrices run by this reviewer worktree-locally on the integrated ms4 branch (after pnpm install --frozen-lockfile + rebuild argon2/esbuild/sharp): pnpm typecheck = Done (api+web); pnpm lint --max-warnings=0 = Done (api+web); vitest run --root apps/api = 29 files passed / 1 skipped, 863 tests passed / 3 skipped; vitest run --root apps/web = 12 files passed, 407 tests passed.

Overall feature completeness:
- COMPLETE and INTEGRATED. All 18 subtasks are implemented, tested, documented, security-reviewed where the plan required it, verified PASS, and merged into ms4. No plan subtask or AC was dropped; every Decision D1-D9/AV1-AV3 maps to a delivered subtask or an explicitly-deferred register entry, and every Risk R1-R9 mitigation is observable in the merged code.
- Forums chain ST1-ST6 hangs together: a single forums.service.ts routes every visibility decision through AuthorizationService.evaluate() (15 call sites, no inline re-derived predicates); both write paths sanitize via normalizeMarkdownBody->validateMarkdownBody; moderation (pin/lock/move) is server-enforced behind assertModerationAccess with the destination board re-evaluated through evaluate() on move (no cross-scope leak); the ST16 web moderation gate is UX-only over that server boundary.
- Anti-abuse ST7-ST9 is actually wired: exceedsLinkLimit + throttleService.checkRequest are applied at forum topic-create, forum post-create, and blog comment-create (P7 enumeration satisfied). The ST8 ReDoS fix (linear indexOf scanner replacing the backtracking regex, 256 KB bounded scan) is real and regression-tested; the shared markdown-sanitizer/markdown-renderer is consistent across blog+pages+forums and the ST16 stored-XSS fix remains closed.
- Identity/media ST11-ST15 integrate cleanly with the ST16/ST17 web surfaces: magic-byte verification (ST11) covers all four resourceTypes incl. avatar; avatar upload (ST12) is self-service with its own size cap and avatar/ prefix; set-avatar (ST15) enforces resourceType+ownership with a single non-oracle error; the public profile exposes exactly five fields and suggest exactly three, no email/role/status/PII leak, avatars surfaced only as the gated /api/media/<id> URL.
- Web ST16-ST17 render user content only through the sanitizing MarkdownRenderer (no dangerouslySetInnerHTML on raw input), encodeURIComponent-encode every username in links/fetches, and fall back to initials when no avatar. ST18 exercises StandalonePageEntity.currentRevision in a DB-gated test (no schema change).
- No new BLOCKING feature-level gap was found: no client-only control without server enforcement, no enumeration/oracle leak, no un-gated media exposure, no un-sanitized injection sink in the integrated feature. The only open items are the previously-forwarded, explicitly-accepted non-blocking follow-ups below.
- Verdict rationale for CONDITIONAL PASS (not PASS): the feature is shippable as-is with zero blocking findings and a green integrated matrix, but two real (non-blocking) actionable items remain - a forums.md doc-accuracy WARNING and the mailto:/tel: word-boundary fail-safe over-count - plus the planning-cycle-only deferred-tasks register closure. These are tracked as Planner-ready follow-ups rather than retained silently.

Findings

BLOCKING
- None

WARNING
- docs/features/forums.md - ST6 moderation doc-prose imprecision: the Moderation section says 'six' endpoints (correct: five) and lists 'unlisted' as a rejected move destination (correct: site-scoped unlisted boards ARE publicly readable and permitted as move targets, per isBoardPubliclyReadable/authorization.service.ts).
  Non-functional doc inaccuracy only (code and tests are correct). Already captured as the ST6 verifier WARNING and accepted as non-blocking; carried forward here so it is fixed in a planning/doc-followup cycle rather than silently retained.
- apps/api/src/common/throttle/link-limit.ts:104-124 - ST8->ST9 link-count limiter: the bare-scheme scan for mailto:/tel: has no leading word-boundary guard (only a charBefore !== '(' check), so 'tel:' inside 'hotel:' and literal 'mailto:'/'tel:' substrings are over-counted.
  Direction is FAIL-SAFE for an anti-spam cap (over-counts -> stricter, never weaker; cannot bypass the cap). At worst it occasionally rejects a legitimate post whose prose contains such a substring. Accepted non-blocking by ST8 security; should get a word-boundary guard mirroring the www. guard.

NOTE
- apps/api/src/users/users.service.ts:40-56 - ST14 accepted residual (R3): an authenticated caller can still incrementally enumerate the active-username space via repeated prefix queries, bounded only by the session gate + throttle + 10-result cap.
  Matches the plan's intended/accepted R3 mitigation for M4 (usernames are inherently semi-public via bylines and @-mentions). No additional control required for M4; revisit only if username harvesting becomes a concern (e.g. per-identity daily quota).
- apps/web/components/user-avatar.tsx:71-77 - ST17 security NOTE N1: resolveAvatarSrc returns its input verbatim with no scheme/prefix check.
  Non-exploitable defense-in-depth: the avatarSrc value originates server-side as /api/media/<id> (the gated serve path), never from raw user input. Optional hardening would assert an /api/media/ prefix.
- apps/web/components/user-avatar.spec.ts - ST17 security NOTE N2: web security coverage uses a pure-function + source-audit test pattern rather than a jsdom render harness.
  Acceptable given the no-DOM test topology; the sanitizer/encodeURIComponent/render-path assertions are non-vacuous (proven to fail against pre-fix code in the ST16 security review). Recorded as a known pattern, not a defect.
- docs/deferred-tasks.md - ST18 currentRevision deferred-tasks register entry is satisfied by commit 066b435 but, per policy, was intentionally NOT closed during this development cycle.
  The register is edited only during a planning cycle. The planner should close the D9-3/ST18 entry (and apply the rest of the section-9 register delta: close magic-byte M2, D9-1 proxy/helmet, D9-2 blog 409; record the Redis-swap/captcha/restricted-boards/per-board-moderator/polls/split-merge/WYSIWYG/avatar-processing deferrals) on the next planning pass. No code action.
- apps/web/app/forums/forums-client.ts - ST16/ST5 minor cosmetic stale type-comments noted by upstream verifiers.
  Cosmetic only; no behavioral or contract impact. Bundle into a low-priority doc/comment cleanup.

Missed functionality or edge cases:
- None blocking. Cross-subtask integration is complete: the forums read/write/moderation chain, the throttle enforcement boundary, the media magic-byte + avatar pipeline, the identity suggest/profile/avatar-ownership surfaces, and the web render/mention/avatar surfaces all line up with the plan ACs and with each other.
- Security trust-boundary sweep found no gap: moderation is server-enforced (web gate is UX-only); no existence oracle on board/topic/post/profile lookups (uniform 404 with byte-identical messages); avatar set-avatar enforces resourceType+ownership; throttle is fail-closed (store error -> request denied, regression-tested); no un-sanitized HTML sink (MarkdownRenderer sanitizer is the only dangerouslySetInnerHTML path; usernames encodeURIComponent-encoded).
- Explicit non-goals (projects-as-usable-surface, polls, split/merge, per-board moderators, captcha/bad-word, mention notifications/persistence, search, WYSIWYG, server-side avatar image processing, Redis) are correctly deferred with register entries and are NOT treated as gaps.
- Edge cases verified by spot-check: locked-topic posting -> 403; invalid parentId (cross-topic / reply-to-reply / nonexistent) -> uniform 400; oversized avatar -> 400 at the avatar cap; SVG and magic-byte-mismatched polyglots -> 400; profile for inactive user -> 404 identical to nonexistent; no-avatar -> initials fallback (no broken image).

Follow-up feature requests for planning:
- Forums docs accuracy fix (from ST6 verifier WARNING): in docs/features/forums.md Moderation section, correct 'six' -> 'five' moderation endpoints and remove the statement that 'unlisted' is a rejected move destination (site-scoped unlisted boards are publicly readable and are valid move targets). Doc-only; no code change. Trace: plan ST6 doc-impact + ST6 verifier WARNING.
- Link-limiter word-boundary guard (from ST8 security WARNING / ST8->ST9 forward): add a leading word-boundary guard for the non-'//' schemes (mailto:, tel:) in apps/api/src/common/throttle/link-limit.ts mirroring the existing www. guard, and add a regression test asserting 'hotel:'/'motel:'/embedded 'mailto:' substrings are not counted as links. Reduces fail-safe false rejections; no security regression. Trace: plan R2/R6, ST8 AC (link-count limiter), ST8 security WARNING.
- Optional avatar-src hardening (from ST17 security NOTE N1): make apps/web/components/user-avatar.tsx resolveAvatarSrc assert an expected /api/media/ prefix (or scheme allowlist) before rendering, as defense-in-depth even though the value is server-supplied. Low priority. Trace: plan ST17 security marker, ST17 NOTE N1.
- Planning-cycle register closure (from ST18 / section-9 register delta): in the next planning cycle, edit docs/deferred-tasks.md to close the D9-3/ST18 currentRevision entry (now satisfied by 066b435), the magic-byte M2 finding (delivered in ST11), the D9-1 proxy/helmet executed tests (ST7), and the D9-2 blog explicit-slug 409 (ST10); and to record the planned M4 deferrals (Redis storage swap owner, captcha/bad-word -> M11, restricted/project boards -> M7/M8, per-board moderators, polls, topic split/merge, WYSIWYG + media-library picker -> M5, server-side avatar image processing). Register-only; per policy not done during this development cycle. Trace: plan section 9.
- Optional test-coverage top-ups (from ST14/ST16/ST17 NOTEs): add a focused escapeLikePrefix unit test (assert q='a%b' yields the escaped LIKE operand) and, if the team later adopts a jsdom web harness, convert the ST17 source-audit avatar/render assertions to rendered-DOM assertions. Non-blocking quality items. Trace: ST14 NOTE, ST17 NOTE N2.

Artifacts written:
- artifacts/milestone-4-forums/reviewer_report.md
- artifacts/milestone-4-forums/reviewer_result.json

Final outcome:
- CONDITIONAL PASS
