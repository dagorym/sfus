# Tester Report — ST11: Magic-Byte Verification for Image Uploads

**Status:** PASS  
**Branch:** ms4-st11-tester-20260607  
**Test Commit:** 036886f  
**Date:** 2026-06-07

---

## Testing Scope

ST11 added a dedicated `image-magic-bytes.ts` helper module with `sniffImageMimeType` and `imageMagicBytesMatch` exports. `assertValidMagicBytes` was wired into `MediaService.uploadImage` (called after `assertValidMimeType` but before `assertValidFileSize`), applying to all three current resource types: `blog-post`, `standalone-page`, and `blog-comment`. The `validFile` fixture in `media.service.test.ts` was updated to use real JPEG magic bytes (FF D8 FF).

---

## Acceptance Criteria Validated

| # | Criterion | Result |
|---|-----------|--------|
| AC1 | Validation rejects (400) a file whose magic bytes do not match an allowed image type even when the content-type header is allowed (polyglot rejected) | PASS |
| AC2 | Polyglot rejection applies to every image resourceType (blog-post, standalone-page, blog-comment — count: 3) | PASS |
| AC3 | SVG remains rejected (not in IMAGE_SIGNATURES, not in MIME allow-list) | PASS |
| AC4 | Compliant real images for each existing resourceType still upload and serve unchanged (no regression) | PASS |
| AC5 | API tsc build + full validation matrix pass | PASS |

---

## Commands Run

- `pnpm --dir /home/tstephen/repos/worktrees/ms4-st11-tester-20260607 install --frozen-lockfile`
- `pnpm --dir /home/tstephen/repos/worktrees/ms4-st11-tester-20260607 lint`
- `pnpm --dir /home/tstephen/repos/worktrees/ms4-st11-tester-20260607 typecheck`
- `pnpm --dir /home/tstephen/repos/worktrees/ms4-st11-tester-20260607 test`
- `pnpm --dir /home/tstephen/repos/worktrees/ms4-st11-tester-20260607 --filter @sfus/api run build`

---

## Test Results

### Full Suite (worktree)

- **API test files:** 20 passed | 1 skipped (integration — requires DB)
- **API tests:** 431 passed | 2 skipped
- **Web test files:** 8 passed
- **Web tests:** 293 passed
- **Lint:** 0 warnings, 0 errors
- **Typecheck:** pass (no errors)
- **API build (tsc):** pass

### ST7 Regression Confirmed

`src/http.integration.test.ts` (ST7's supertest-based integration tests): **6 tests passed** — no regression. The prior implementer report incorrectly labelled this as a pre-existing failure due to missing `node_modules`; running `pnpm install --frozen-lockfile` in the worktree resolved this, as directed by the coordinator's procedural note.

---

## New Test Files

### `apps/api/src/media/image-magic-bytes.test.ts` (new, 28 tests)

Tests the helper class exhaustively per plan P7 guidance:

- `sniffImageMimeType` — per-format classification: JPEG, PNG, GIF87a, GIF89a, WebP (including wildcard size bytes)
- `sniffImageMimeType` — short-buffer boundary: empty buffer, 11-byte buffer, exactly-12-byte acceptance
- `imageMagicBytesMatch` — claimed/actual agreement for all five supported formats
- `imageMagicBytesMatch` — polyglot rejection: cross-type mismatches (PNG as JPEG, JPEG as PNG, etc.)
- `imageMagicBytesMatch` — unrecognised MIME type rejection: SVG, PDF, empty string, text/html
- `imageMagicBytesMatch` — short-buffer rejection

### `apps/api/src/media/media.service.test.ts` (extended, +16 tests, total 38)

Added to existing file via minimal targeted edits:

- `assertValidMagicBytes` describe block (12 tests): accepts valid JPEG/PNG/GIF87a/GIF89a/WebP, throws on polyglot (PNG→JPEG, JPEG→PNG), throws on SVG MIME type, error message content, short buffer
- Polyglot rejection in `uploadImage` pipeline: non-vacuous cross-type polyglot rejected before filesystem write
- No-regression per-resourceType: `blog-post`, `standalone-page`, `blog-comment` each accept a valid JPEG upload and produce correct metadata
- Polyglot for `standalone-page` and `blog-comment` resourceTypes explicitly tested

---

## Assumptions

None. All test locations and commands were provided explicitly. Framework (Vitest) confirmed from existing test files.

---

## Artifacts Written

- `artifacts/milestone-4-forums/ST11/tester_report.md` (this file)
- `artifacts/milestone-4-forums/ST11/tester_result.json`
- `artifacts/milestone-4-forums/ST11/documenter_prompt.txt`
