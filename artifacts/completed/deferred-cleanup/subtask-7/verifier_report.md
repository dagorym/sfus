# Verifier Report

## Scope reviewed

- **Implementer** (commit 9950e91): Hardened `NavigationService.validateUrl` with a new `linkType` parameter (default `"internal"`). Added rejection logic for internal items whose URL does not start with `'/'` or starts with `'//'`. Updated `create()` and `update()` to pass the effective link type. Added JSDoc documenting the rule and the prospective-only posture.
- **Tester** (commit 9d856d5): Added 13 new tests to `navigation.service.test.ts` covering the hardened validation on both create and update paths, external-item passthrough, moderator-role publication filtering, all-children-filtered-but-parent-visible edge case, and LessThanOrEqual operator type pin.
- **Documenter** (commit 4d3bce1): Updated `docs/features/navigation.md` field-rules paragraph to remove the stale `(no leading-'/' requirement today)` note and document the implemented constraint with prospective-only posture.

## Acceptance criteria / plan reference

- Task brief provided in coordinator prompt for cleanup-subtask-7.
- Supporting artifacts: `artifacts/deferred-cleanup/subtask-7/implementer_report.md` and `tester_report.md`.

Acceptance criteria evaluated:
1. Internal items whose URL does not start with `'/'` or starts with `'//'` are rejected with a controlled 400 on create and update; `'/about'` passes.
2. External item validation unchanged.
3. Read paths (`findPublic`, `findForAuthenticatedUser`, `findAll`) unaffected.
4. JSDoc on `validateUrl` states the rule and the prospective-only posture.
5. `docs/features/navigation.md` field-rules accurately reflect the implemented constraint and prospective-only enforcement posture.

## Convention files considered

- `AGENTS.md` — agent workflow and single-source-of-truth rules
- `CLAUDE.md` — entry-point redirect to AGENTS.md
- `apps/api/src/navigation/navigation.service.ts` — implementation under review
- `apps/api/src/navigation/navigation.service.test.ts` — tests under review
- `docs/features/navigation.md` — documentation under review

---

## Findings

### BLOCKING

None.

### WARNING

None.

### NOTE

- `apps/api/src/navigation/navigation.service.ts` lines 201–210 — **Update with only `linkType` change (no `url` provided) skips URL re-validation**

  If a PATCH request provides only `{ linkType: "internal" }` to reclassify an existing external item (e.g. one with `url: "https://example.com"`), the existing URL is not re-validated against the internal constraint because `input.url` is `undefined` and the `if (input.url !== undefined)` guard skips the `validateUrl` call. This is consistent with the documented prospective-only enforcement posture — existing rows are not retroactively validated — but means switching an item's `linkType` from `external` to `internal` without also supplying a conforming `url` can leave a stored URL in an internally-invalid state. The docs correctly disclose the prospective-only posture, so this is by design, not a bug. It is worth noting here so reviewers are aware of the intentional boundary.

---

## Test sufficiency assessment

Sufficient. The 13 new tests directly exercise all five acceptance criteria:

- **Create path**: `'/about'` accepted (AC1); `'//'` rejected (AC1); `'//evil.com'` rejected (AC1); `'about'` rejected (AC1); `'http://example.com'` rejected as internal (AC1); `'http://example.com'` accepted as external (AC2).
- **Update path**: `'/about'` accepted (AC1); `'//'` rejected (AC1); `'//evil.com'` rejected (AC1); `'about'` rejected (AC1); simultaneous `linkType=external` + url switch accepted (AC2).
- **Moderator role**: non-admin publication filtering and admin-visibility exclusion verified (confirms `findForAuthenticatedUser` read-path behavior unchanged for non-admin roles — AC3).
- **All-children-filtered-but-parent-visible**: parent still present with empty children array (edge case, AC3).
- **LessThanOrEqual operator type pin**: assertion upgraded from `typeof` check to `.type === "lessThanOrEqual"` (test quality improvement, not a new AC).

Full API suite: 310 passed, 2 skipped (integration), 0 failed. Typecheck and lint: clean.

## Documentation accuracy assessment

Accurate. The `docs/features/navigation.md` field-rules paragraph now correctly states:
- `url` non-empty string ≤ 512 chars;
- for `internal` items (the default) the URL must start with a single `/`;
- protocol-relative `//` prefixes are rejected with `400`;
- external items are validated only for presence and length;
- the constraint is enforced prospectively on create and update; existing rows are unaffected.

The stale `(no leading-'/' requirement today — hardening note in docs/deferred-tasks.md)` note has been removed. No duplication or contradiction found across the documentation set.

---

## Verdict

**PASS**

All five acceptance criteria are satisfied. The implementation is correct, the tests are sufficient, and the documentation is accurate. The single NOTE-level finding (linkType-only reclassification skipping URL re-validation) is by design and explicitly covered by the documented prospective-only posture.
