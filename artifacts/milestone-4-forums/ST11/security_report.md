Security Review Report

Scope reviewed:
- Milestone 4 subtask ST11 - magic-byte (content-sniffing) verification for all image uploads, reviewed as the diff ms4...HEAD.
- apps/api/src/media/image-magic-bytes.ts - new sniffing helper: sniffImageMimeType(buf) and imageMagicBytesMatch(buf, claimedMimeType); signatures for JPEG (FF D8 FF), PNG (89 50 4E 47 0D 0A 1A 0A), GIF87a/GIF89a, WebP (RIFF????WEBP, 12-byte); MIN_SNIFF_BYTES=12.
- apps/api/src/media/media.service.ts - assertValidMagicBytes wired into uploadImage AFTER the MIME allow-list check and BEFORE any filesystem write; throws BadRequestException (400) on mismatch.
- apps/api/src/media/image-magic-bytes.test.ts (28 tests) and media.service.test.ts (38 tests) - format-class, SVG-exclusion, polyglot, short-buffer, per-resourceType no-regression coverage.
- apps/api/src/media/media.controller.ts and json-exception.filter.ts - confirmed single upload funnel and the client error contract.
- docs/features/media.md - magic-byte verification contract and SVG-excluded note.
- Validation run from this worktree: pnpm install --frozen-lockfile; API media test suites (66 passed); full API suite (431 passed, 2 DB-gated integration tests skipped); API typecheck (tsc --noEmit) clean; API eslint --max-warnings=0 clean.

Why specialist review was triggered:
- ST11 is plan-marked security-sensitive because it closes a real prior finding M2: the media pipeline previously trusted only the client-supplied content-type with no byte sniffing, so a polyglot/disguised file (allowed content-type header, non-image bytes) could be stored and later served.
- The review goal is to confirm the sniffing logic is CORRECT and COMPLETE and that M2 is genuinely closed - not papered over - per plan ST11 acceptance criteria, deferred-register finding M2, and retrospective pattern P7 (partial-breadth fixes).
- VERDICT ON M2: CLOSED. The exact gap (trusting Content-Type with no byte verification) is remediated at the single shared validation point in uploadImage; a polyglot with an allowed content-type header but non-image bytes is now rejected 400 before any file is written. Verified by the upload-level test that asserts writeFileSync is never called for a PNG-bytes/image-jpeg-header polyglot.

Acceptance criteria / plan reference:
- plans/milestone-4-forums-plan.md ST11 (lines 329-346): reject 400 any file whose signature does not match an allowed image type even when the client content-type is allowed; apply to every image resourceType (P7); SVG stays excluded; closes M2; API tsc + validation matrix pass; security review required.
- docs/deferred-tasks.md finding M2 (the original polyglot/no-byte-sniffing finding, scheduled into M4 ST11; remove only after the M4 implementation review passes).
- docs/development/agent-retrospective-patterns.md P7 (partial-breadth fixes - pattern fixed at one call site, missed at the rest).
- docs/features/media.md (magic-byte verification contract and SVG-excluded note).

Findings

BLOCKING
- None

WARNING
- None

NOTE
- apps/api/src/media/image-magic-bytes.ts:66 - Leading-byte signature verification does not detect a trailing active payload appended after a genuinely-valid image header (e.g. a real JPEG header followed by appended HTML/JS bytes). This is inherent to magic-byte sniffing and is OUT of ST11 scope, not a defect in the implementation.
  Residual risk is adequately mitigated by the serving posture: the stored mimeType is the validated allowed image type, GET /api/media/:id serves with that exact Content-Type, the global helmet X-Content-Type-Options: nosniff header (confirmed applied app-wide via app.use(helmet(...)) in index.ts and asserted by http.integration.test.ts) prevents browser content-sniffing, and Content-Disposition: inline uses a sanitized filename. No action required for ST11; full structural image parsing/re-encoding remains a future media-processing concern already deferred.

Test sufficiency assessment:
- SUFFICIENT for the security-sensitive behavior. Helper tests cover correct per-format classification (JPEG/PNG/GIF87a/GIF89a/WebP), the WebP wildcard size-field positions (varying bytes 4-7 still classify as WebP), and rejection of unknown formats (PDF, all-zero, SVG-like text).
- Polyglot detection is tested non-vacuously at both layers: helper imageMagicBytesMatch (PNG bytes vs claimed image/jpeg = false, and other cross-type pairs), and the full uploadImage path which additionally asserts fs.writeFileSync is NOT called when a polyglot is rejected.
- SVG exclusion is double-covered: sniffImageMimeType returns null for SVG-like bytes and imageMagicBytesMatch(_, image/svg+xml) returns false; service-level test confirms 400 for an SVG MIME type.
- Short-buffer/bypass boundary covered: empty and 11-byte buffers (one below MIN_SNIFF_BYTES=12) are rejected even with a claimed allow-listed type.
- P7 breadth covered: per-resourceType acceptance (blog-post, standalone-page, blog-comment) plus per-resourceType polyglot rejection (standalone-page, blog-comment) confirm the check applies across every current image resourceType; ST12 avatar will inherit the same single funnel.
- Error-contract covered: a test asserts the BadRequestException message contains the static 'File content does not match the declared content type' string.
- All 66 ST11-relevant tests pass; full API suite of 431 tests passes (2 DB-gated integration tests skipped as designed).

Documentation / operational guidance assessment:
- SUFFICIENT. docs/features/media.md documents the magic-byte verification contract: after the MIME allow-list check the server reads leading bytes and compares against JPEG/PNG/GIF/WebP signatures, rejects 400 on mismatch even when the Content-Type names an allowed type, applies to every image resourceType, and keeps SVG excluded from both the allow-list and the signatures because SVG can embed executable content.
- The upload endpoint's 400 reason list in the API table now includes 'magic-byte mismatch'.
- No operational/runbook changes are required; the check is config-independent and adds no new environment variables.

Artifacts written:
- artifacts/milestone-4-forums/ST11/security_report.md
- artifacts/milestone-4-forums/ST11/security_result.json

Outcome:
- PASS
