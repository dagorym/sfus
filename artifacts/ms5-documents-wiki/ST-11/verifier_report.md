Verifier Report

Scope reviewed:
- Implementer: forums.service.ts — resolveTopicLastActivity adds post.created_at to raw query and populates activity.at; listPublicCategories and getPublicBoard effectiveAt changed from topic.lastPostAt to activity.at ?? topic.lastPostAt ?? topic.createdAt.
- Implementer: forums.types.ts — JSDoc updated for TopicLastActivity.at and BoardLastPostShape.at.
- Tester: forums.service.test.ts — 7 new ST-11 tests; makeRawQb and makeLastActivityQb row types extended with optional createdAt.
- Documenter: docs/features/forums.md — BoardLastPostShape.at and TopicLastActivity.at field notes updated.

Acceptance criteria / plan reference:
- plans/ms5-documents-wiki-plan.md, ST-11 — Forums last-activity cleanup.
- AC1: Board lastPost activity reflects the latest non-deleted reply; a soft-deleted latest reply no longer drives the displayed last-activity date.
- AC2: TopicLastActivity.at is consistently populated (non-null) in the reply case; null only for the opening-post fallback. No remaining always-null field.
- AC3: The full @sfus/api suite stays green.

Convention files considered:
- AGENTS.md
- plans/ms5-documents-wiki-plan.md (P7 partial-breadth fix rule)
- docs/development/api-conventions.md

Findings

BLOCKING
- None

WARNING
- None

NOTE
- None

Test sufficiency assessment:
- 7 new tests cover all three acceptance criteria directly.
- resolveTopicLastActivity: activity.at populated as Date (AC2), coerced from ISO string (AC2), null for fallback (AC2 regression guard).
- listPublicCategories: effectiveAt takes activity.at over topic.lastPostAt (AC2), soft-deleted reply falls back to topic.createdAt not stale lastPostAt (AC1), full shape guard.
- getPublicBoard: effectiveAt takes activity.at (AC2), soft-deleted reply falls back to topic.createdAt (AC1).
- Helper type extensions are backward-compatible — existing tests pass unchanged because rows without createdAt yield activity.at=null and fall back to topic.lastPostAt as before.
- Test coverage is sufficient for the changed behavior and acceptance criteria.

Documentation accuracy assessment:
- docs/features/forums.md BoardLastPostShape.at note updated to state NON-DELETED reply createdAt sourced from the posts table, preventing stale dates from soft-deleted replies. Accurate.
- docs/features/forums.md TopicLastActivity.at note updated with the same posts-table derivation and soft-delete guard. Accurate.
- No other docs reference the changed behavior. Documentation is complete and matches the implementation.

Artifacts written:
- artifacts/ms5-documents-wiki/ST-11/verifier_report.md
- artifacts/ms5-documents-wiki/ST-11/verifier_result.json

Verdict:
- PASS
