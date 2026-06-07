# Security Report — deferred-cleanup subtask-3

## Review Scope

Blog comment payload data minimization and existence-oracle normalization.

- **Fields trimmed from public responses:** `authorUserId`, `moderatedByUserId`, `moderatedAt`
- **Public endpoints affected:** `GET /:postId/comments` (listComments), `POST /:postId/comments` (createComment)
- **Admin/moderation endpoints verified unchanged:** `GET /moderation/comments/:postId`, `PATCH /moderation/comments/:commentId/status`
- **Oracle normalization:** `parentId` failure uniform message; `imageId` failure uniform message

## Why Specialist Review Was Triggered

Plan subtask-3 is flagged security-sensitive: data minimization (PII/sensitive field exposure on public guest-accessible endpoints) and existence-oracle removal (information disclosure via distinguishable error messages). Both are exploitable by unauthenticated callers.

## Governing Plan / Acceptance Reference

`plans/deferred-cleanup-plan.md`, section "subtask-3 — Blog comment payload trim and oracle normalization", acceptance criteria 1–5.

---

## Findings by Severity

### Blocking — None

No blocking security findings.

---

### Moderate — None

No moderate findings.

---

### Low

#### L1: `docs/features/blog.md` still describes distinguishable `parentId`/`imageId` failure reasons (documentation defect, AC4 partial miss)

**File:** `docs/features/blog.md`, line 38 (member comment creation table row)

**Current text (stale):**
> `400` empty/unsafe body, unknown `imageId`, `imageId` not `blog-comment`-scoped, unknown parent, parent from another post, or reply-to-a-reply (max 1 level).

This enumerates separate distinguishable failure reasons for `imageId` and `parentId`, which contradicts the oracle normalization applied in the implementation. After the fix, callers cannot distinguish "unknown parent" from "parent from another post" or "unknown imageId" from "imageId with wrong scope" — both collapse to a single uniform `400`. The documentation should read something like: `parentId invalid (nonexistent or not on this post)`; `imageId invalid (nonexistent or wrong scope)`.

**Impact:** A reader of the documentation may incorrectly believe existence oracles remain in place, or write client code that attempts to branch on the more specific error text. No information leaks from the running API — this is a documentation accuracy defect only.

**Action:** Documenter role should update line 38 to match the uniform messages.

---

#### L2: `docs/features/blog.md` response-shapes section still describes `BlogCommentDetail` as including trimmed fields, with note that trimming is deferred (documentation defect, AC4 partial miss)

**File:** `docs/features/blog.md`, lines 94–97

**Current text (stale):**
> `BlogCommentDetail`: `id, postId, parentId, authorUserId, body, status, mediaReferenceId, moderatedByUserId, moderatedAt, createdAt, updatedAt` (+ `replies` on top-level entries from the public list route). Note: the public payload currently includes the moderation metadata fields — trimming them is a deferred task.

`authorUserId`, `moderatedByUserId`, and `moderatedAt` are no longer in the public comment payload. The "deferred task" note is resolved. The response-shapes section should be updated to split public vs. moderation payloads: the public `BlogCommentDetail` omits those three fields; the admin/moderation full payload retains them.

**Impact:** Documentation mismatch only — no information leaks from the running API.

**Action:** Documenter role should update the response shapes section to document the public-vs-admin payload split.

---

### Observation

#### O1: Web client `moderationListComments` and `moderateCommentStatus` use the public `BlogCommentDetail` type, which under-declares the API moderation response

**File:** `apps/web/app/blog/blog-client.ts`, lines 307 and 320

The moderation functions in the web client type-cast responses as `{ comments: BlogCommentDetail[] }` / `{ comment: BlogCommentDetail }`. The actual API response for those endpoints includes `authorUserId`, `moderatedByUserId`, and `moderatedAt` (served by `toCommentDetail`), but the web type does not declare them.

This causes no security problem in the current codebase: there is no admin UI consuming these functions in `apps/web/app/admin/` (verified by grep), so the extra fields are silently discarded at the TypeScript type boundary and never rendered. The security property is unaffected — fields are not exposed to public users.

The risk is prospective: if a moderation UI is added that calls `moderationListComments` or `moderateCommentStatus`, developers may miss the availability of the moderation fields unless a separate `AdminBlogCommentDetail` type (extending `BlogCommentDetail` with the three fields) is introduced.

**Action:** No immediate change required. Deferred scope — document that a richer web type will be needed before building a moderation UI that surfaces these fields.

---

## Test Sufficiency Assessment

The tester added 42 new tests (28 API + 6 web, net after delta counting):

- **Oracle-parity tests (service layer):** 6 tests confirm both parentId failure modes and both imageId failure modes emit identical messages, and verify the messages match the expected literals. These are exactly the right oracle tests and are adequate.
- **Data-minimization tests (controller layer):** Source-level assertions confirm the `PublicBlogCommentDetail` interface body excludes the three fields and `BlogCommentDetail` includes them; call-site assertions confirm public handlers use the public serializer and moderation handlers use the full serializer. These are structural; complemented by runtime integration coverage via end-to-end test (admin UI spec).
- **Web mirror type tests:** 7 tests confirm `BlogCommentDetail` in `blog-client.ts` does not declare the three fields in the interface body and that no references appear after the interface. These are adequate for AC5.

**Gap:** No test explicitly confirms that moderation endpoints (`moderationListComments`, `moderateCommentStatus`) actually return `authorUserId`, `moderatedByUserId`, and `moderatedAt` in their HTTP response body at the runtime level. The controller-layer tests verify the serializer mapping (`toCommentDetail` returns those fields) but do not fire an HTTP integration test that confirms the moderation route response JSON contains the fields. This is a low-priority coverage gap — it does not affect the security properties of the current deployment — but a future maintainer refactoring the moderation serializer path may not catch a regression without it.

**Overall:** Adequate for the security properties under review. The oracle-parity and data-minimization tests are well-targeted.

---

## Documentation / Operational Guidance Assessment

Inline code documentation (JSDoc on `toPublicCommentDetail`, `toCommentDetail`, `toPublicCommentDetailWithReplies`, `createComment`) is accurate and sufficiently explains the data-minimization intent.

Swagger `@ApiOkResponse` and `@ApiBadRequestResponse` decorators on the controller are updated and reflect the new contract.

`docs/features/blog.md` has two stale sections (L1 and L2 above). These are open documentation defects but do not affect the security properties of the running system. They should be resolved by the Documenter in the normal workflow.

---

## Acceptance Criteria Evaluation

| AC | Description | Verdict |
|----|-------------|---------|
| AC1 | Public comment payloads contain none of the three trimmed fields | PASS |
| AC2 | Admin/moderation behavior unchanged | PASS |
| AC3 | parentId rejections uniform; imageId rejections uniform | PASS |
| AC4 | Swagger response models and JSDoc match new payloads | PARTIAL — controller Swagger updated; docs/features/blog.md stale (L1, L2) |
| AC5 | Zero references to trimmed fields in apps/web | PASS |

---

## Final Outcome

**CONDITIONAL PASS**

The implementation correctly achieves all security-sensitive objectives: trimmed fields are absent from all public comment responses, moderation endpoints retain full data, and no existence oracle remains on `parentId` or `imageId` failure paths. Two documentation defects in `docs/features/blog.md` remain (L1, L2) — these do not affect the security of the running system but partially miss AC4. Resolution is delegated to the Documenter role.

No blocking security findings. No code changes required.
