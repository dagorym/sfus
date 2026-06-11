Security Review Report

Scope reviewed:
- Specialist security RE-REVIEW of MS5 ST-2 (Documents read API) after a Verifier-driven remediation pass; read-only product-code review against coordination base branch ms5.
- Re-reviewed: apps/api/src/docs/docs.service.ts (getPageByPath, listPageTree, listRecentEdits, isPagePubliclyReadable, computePathHash, and the remediated buildBreadcrumbs).
- Re-reviewed: apps/api/src/docs/docs.controller.ts (GET /api/docs, GET /api/docs/recent, GET /api/docs/*path), docs.module.ts, docs.types.ts.
- Re-reviewed tests: apps/api/src/docs/docs.service.test.ts (incl. the new negative breadcrumb tests) and docs.controller.test.ts.
- Re-reviewed docs: docs/features/documents.md and docs/README.md routing row.
- Cross-checked AuthorizationService.evaluate() semantics for the anonymous actor { userId: null, globalRole: '' } to confirm the gate blocks members/private and that project scope short-circuits before evaluate().

Why specialist review was triggered:
- ST-2 exposes new unauthenticated, publicly-reachable read paths whose correctness is a visibility/leak boundary; any defect can expose gated content or create an existence oracle (P12).
- The prior specialist review returned CONDITIONAL PASS with one Medium WARNING: buildBreadcrumbs did not route ancestors through isPagePubliclyReadable, risking id/title leakage of a non-readable ancestor. This re-review confirms the remediation closes that WARNING.
- Planner marked ST-2 'Security review: required'.

Acceptance criteria / plan reference:
- plans/ms5-documents-wiki-plan.md (ST-2 acceptance criteria AC1-AC5).
- Prior security report archived at artifacts/ms5-documents-wiki/ST-2/history/verifier-1-warn/security_report.md (CONDITIONAL PASS, one WARNING).
- Coordinator re-review focus: (1) breadcrumb gating remediation, (2) oracle parity P12, (3) central-gate routing, (4) project-scope isolation, (5) injection/lookup integrity and limit bounding.

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/docs/docs.service.ts:287 - DocsPageShape exposes the raw parentId UUID of the immediate parent unconditionally, even when that immediate parent is gated (project-scoped / members / private / deleted) and is therefore correctly omitted from breadcrumbs.
  Not exploitable in ST-2 and not a regression from the remediation (it pre-dates the breadcrumb WARNING and was already present at the prior CONDITIONAL PASS). The leaked value is an opaque UUID, not a human-readable title or body, and there is no public id-based lookup endpoint in DocsController (all resolution is by path-hash, plus tree/recent), so the UUID cannot be turned into content or a confirmable existence probe today. The caller already knows the requested page has some parent (depth>0, multi-segment path). Recorded for ST-3+ awareness: if any future endpoint resolves pages by id, parentId on the page shape would become an enumerable existence oracle for gated parents and should at that point be null-masked when the immediate parent fails isPagePubliclyReadable.

Test sufficiency assessment:
- REMEDIATION VERIFIED: docs.service.test.ts adds three negative breadcrumb tests proving chain truncation — project-scoped ancestor (lines 274-306), deleted ancestor (308-335), and private ancestor (337-365). Each asserts the target page is still returned without error, breadcrumbs has length 0, and the gated ancestor's id AND title are absent. These tests construct the real DocsService with the real AuthorizationService (not a stubbed gate), so they exercise the actual evaluate()-routed decision.
- Chain-truncation (not per-item skip) is proven by construction: the gated ancestor is the immediate parent, so a per-item skip would still have to decide what to do with shallower ancestors; the tests assert a fully empty breadcrumb list, which is the truncation behavior. The implementation (docs.service.ts:237-251) uses break-on-first-gate then reverse, which is genuine chain truncation.
- No new positional existence side channel: a gated ancestor and a genuinely absent ancestor both yield the same omission (empty/shortened chain) with no placeholder, marker, or count difference — verified against the truncation tests and the readable-ancestor test (lines 231-260) which is the only case producing a non-empty chain.
- Oracle parity (P12) remains fully covered: service tests assert identical NotFoundException(PAGE_NOT_FOUND_MESSAGE) for nonexistent, deleted, members, and private pages and that nonexistent===deleted===gated message strings match; controller tests assert the same identical 404 message at the HTTP boundary including empty/whitespace path.
- Central-gate routing (AC5) covered by evaluate() spies on getPageByPath, listPageTree, listRecentEdits, parent lookup, and isPagePubliclyReadable, asserting the anonymous actor { userId: null, globalRole: '' } and no inline predicate; project scope is proven to short-circuit before evaluate().
- Scope isolation covered: project pages asserted absent from listPageTree results and from the recent-feed allow-list, and now also from breadcrumb ancestry via the new project-scoped negative test.
- Recent-feed limit bounding covered: default=5, cap=20, clamp-below-1, provided-limit honored.
- Static-analysis confirmation of the gate: AuthorizationService.evaluate() denies members/private for an actor with no userId (returns at the !actor.userId branch), so the anonymous breadcrumb gate genuinely excludes those visibilities; unlisted/public are intentionally allowed (consistent with the rest of the read surface).

Documentation / operational guidance assessment:
- REMEDIATION VERIFIED in docs: docs/features/documents.md lines 62-66 now describe ancestor breadcrumb gating and chain truncation ('if an ancestor fails ... the chain is truncated at that point — that ancestor and all shallower ancestors are omitted ... oracle parity: gated === absent'). The prior offending line that documented non-readable ancestors as deliberately included is gone.
- documents.md continues to accurately document oracle parity (P12), scope exclusion, central-gate routing with the anonymous actor, the three endpoints, the recent-feed limit (default 5 / max 20 / clamp-to-1), computePathHash input format, and the route-ordering requirement (recent before *path).
- docs/README.md retains the routing row mapping the Documents feature doc to apps/api/src/docs/. No operational/runbook gap for this read-only surface.

Artifacts written:
- artifacts/ms5-documents-wiki/ST-2/security_report.md
- artifacts/ms5-documents-wiki/ST-2/security_result.json

Outcome:
- PASS
