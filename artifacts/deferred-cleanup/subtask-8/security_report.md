# Security Review Report

**Subtask:** deferred-cleanup/subtask-8
**Review type:** Comprehensive specialist security review — entire media subsystem
**Branch reviewed:** cleanup-subtask-8-security-20260607 (HEAD merges implementer, tester, documenter, verifier work)
**Governing plan:** plans/deferred-cleanup-plan.md, subtask-8
**Date:** 2026-06-07
**Reviewer role:** Security Agent

---

## Scope

This review discharges the retroactive specialist security review of the entire media
subsystem that was deferred from the ms3-completion cycle. It covers:

1. Upload handling — multer configuration, MIME allow-list, size limits, DoS resilience
2. Content-type validation — MIME source-of-truth, polyglot file risks, whitelist completeness
3. Serve path — path traversal prevention, access control, TOCTOU hardening, Content-Disposition
4. Sanitizer — pattern anchoring (event-handler, data: URI), all DANGEROUS_HTML_PATTERNS, bypass analysis
5. Client-side defense-in-depth — MarkdownRenderer HTML stripping, URI scheme re-validation
6. Integration and flow — sanitizer callsites in blog and pages services, privilege boundaries
7. Test coverage — rejection classes, prose-acceptance, path traversal, edge cases
8. Documentation — docs/features/media.md accuracy against implementation

Files reviewed:
- `apps/api/src/media/markdown-sanitizer.ts`
- `apps/api/src/media/markdown-sanitizer.test.ts`
- `apps/api/src/media/media.controller.ts`
- `apps/api/src/media/media.controller.test.ts`
- `apps/api/src/media/media.service.ts`
- `apps/api/src/media/media.service.test.ts`
- `apps/api/src/media/entities/media-reference.entity.ts`
- `apps/api/src/config/environment.ts`
- `apps/api/src/index.ts`
- `apps/api/src/blog/blog.service.ts` (sanitizer call sites)
- `apps/api/src/pages/pages.service.ts` (sanitizer call sites)
- `apps/web/components/markdown-renderer.tsx`
- `apps/web/components/image-upload.tsx`
- `docs/features/media.md`

---

## Findings

### HIGH / BLOCKING

None identified.

---

### MEDIUM

**M1: No X-Content-Type-Options: nosniff header on served media**
`apps/api/src/index.ts` (bootstrap), `apps/api/src/media/media.controller.ts:141-147`

The serve endpoint (`GET /api/media/:id`) sets `Content-Type` from the stored (and re-validated)
`mimeType` value, which is correctly restricted to the allow-list. However, the API server
does not emit `X-Content-Type-Options: nosniff` globally. Without this header, some browsers
and CDN configurations may perform MIME-type sniffing on response bodies, potentially
misidentifying a stored file as a different content type. For a subsystem that allows
`image/gif` (which may embed arbitrary data in comment sections) and streams raw file bytes,
this is a low-friction defense to add.

**Risk:** Low (actual content is restricted by MIME allow-list; still, defense-in-depth is missing).
**Recommended action:** Add `X-Content-Type-Options: nosniff` to the API bootstrap (globally,
not per-route). This is a one-line addition using Express `res.set` or a helmet-style middleware.

---

**M2: Content validation is header-only — no magic-byte verification**
`apps/api/src/media/media.service.ts:68`, `apps/api/src/media/media.controller.ts:79-81`

MIME type validation in `assertValidMimeType` checks `file.mimetype`, which originates from
the `Content-Type` field in the multipart form-data upload. Multer reads and trusts this
header value without inspecting file bytes. An attacker can upload a PNG with a valid
`image/jpeg` header (or vice versa), or upload an HTML file with `image/png` reported by
the browser. If the browser's Content-Type field differs from actual file content, the
stored file may be misclassified.

**Concrete polyglot risk:** A JPEG/HTML polyglot uploaded as `image/jpeg` passes MIME
validation but embeds HTML content that older browser versions might execute in certain
fetch-as-blob or direct navigation scenarios.

**Mitigating factors:**
- The allow-list (`image/jpeg`, `image/png`, `image/gif`, `image/webp`) excludes
  `image/svg+xml` (the most dangerous polyglot surface in modern browsers) — this is the
  correct and highest-value exclusion.
- `X-Content-Type-Options: nosniff` (if added per M1) would prevent browser MIME sniffing.
- Served files use `Content-Disposition: inline` (not `attachment`) with the stored
  MIME type, which limits the sniffing attack surface on compliant browsers.
- The serve endpoint is public but unauthenticated reads are intentionally permitted per design.

**Risk:** Low-to-medium for current allow-list. If `image/svg+xml` is ever added to the
allow-list without magic-byte verification, the risk escalates significantly to XSS.

**Recommended action:** Document the magic-byte assumption explicitly in `media.service.ts`
and `docs/features/media.md`. Ensure that `image/svg+xml` is never added to the allow-list
without also adding magic-byte verification or a parser-based SVG sanitizer. Consider adding
file-type magic-byte checks (e.g., the `file-type` npm package) as a low-overhead hardening
step in a future cycle.

---

### LOW

**L1: HTML comment bypass in event-handler pattern (pre-existing, not introduced by this diff)**
`apps/api/src/media/markdown-sanitizer.ts:41` — `/<[^>]*\bon\w+\s*=/i`

Input `<img <!-- comment --> onload=x>` is not caught by this pattern. The `[^>]*`
quantifier stops at the `>` in the embedded `-->` comment, so `onload=x` falls outside the
matched `<...>` span. This was identified by the verifier (W1) and is a known limitation of
regex-based HTML sanitization.

**Mitigating factors:**
- HTML5 parsers do not treat embedded comments inside a tag as valid; no major browser
  executes event handlers on such malformed tags.
- The client-side `MarkdownRenderer` strips all raw HTML tags before rendering (defense-in-depth).
- This bypass class predates the subtask-8 changes and was not worsened by them.

**Risk:** Very low (no real browser renders this as executable).
**Recommended action:** Add a code comment in `markdown-sanitizer.ts` at line 41 noting this
known limitation, so future maintainers understand the constraint without having to rediscover it.
No code change needed for this cycle.

---

**L2: `javascript:` and `vbscript:` patterns are context-free (acceptable design decision)**
`apps/api/src/media/markdown-sanitizer.ts:51-52`

Both `/javascript\s*:/i` and `/vbscript\s*:/i` are not anchored to URL positions. The
implementer reviewed these and correctly determined that the false-positive risk (legitimate
prose containing `javascript:`) is negligible compared to the security value of context-free
matching. This assessment is sound. No change needed.

**Risk:** Negligible false-positive risk; correct security trade-off.

---

**L3: URL-encoded scheme bypass (pre-existing, mitigated by client layer)**
`apps/api/src/media/markdown-sanitizer.ts` — all URI scheme patterns

`%6Aavascript:` and `&#106;avascript:` forms are not caught by the server-side patterns.
This is a known limitation of regex-based sanitization without a URL-decode pass. The
client-side `MarkdownRenderer.sanitizeUrl()` re-validates all link and image URLs against
an allowlist (`/^https?:\/\//`, relative paths starting with `/`, `./`, or `../`) and
rejects all other schemes — including URL-encoded variants, which would fail the regex test
and produce `#`. This two-layer defense adequately addresses the bypass.

**Risk:** Low (mitigated by client-side URL allowlist).

---

**L4: Content-Disposition filename injection risk (negligible)**
`apps/api/src/media/media.controller.ts:144-147`

The `Content-Disposition: inline; filename="..."` header is constructed from
`media.originalFilename`, which is sanitized at upload time via `path.basename` +
`/[^\w.-]/g → "_"` + 255-char limit. The header value replaces `"` with `\\"`. The
sanitized filename cannot contain characters that would allow header injection (CR, LF, or
unescaped quotes) because all non-word, non-dot, non-dash characters are replaced by `_` at
ingestion.

**Risk:** Negligible (filename is already sanitized at upload time).

---

## Sanitizer Pattern Review

All 14 `DANGEROUS_HTML_PATTERNS` entries reviewed:

| Pattern | Anchoring | Assessment |
|---|---|---|
| `/<script[\s\S]*?>/i` | Tag-anchored (lazy) | Correct. Blocks `<script ...>` in all forms. |
| `/<\/script>/i` | Tag-anchored | Correct. Blocks closing `</script>`. |
| `/<[^>]*\bon\w+\s*=/i` | HTML tag context (subtask-8 change) | Correct. Anchored to tag body. Known HTML comment edge case (L1, pre-existing). |
| `/<iframe[\s\S]*?>/i` | Tag-anchored (lazy) | Correct. |
| `/<\/iframe>/i` | Tag-anchored | Correct. |
| `/<object[\s\S]*?>/i` | Tag-anchored (lazy) | Correct. |
| `/<\/object>/i` | Tag-anchored | Correct. |
| `/<embed[\s\S]*?>/i` | Tag-anchored (lazy) | Correct. |
| `/<form[\s\S]*?>/i` | Tag-anchored (lazy) | Correct. |
| `/<\/form>/i` | Tag-anchored | Correct. |
| `/<input[\s\S]*?>/i` | Tag-anchored (lazy) | Correct. |
| `/<button[\s\S]*?>/i` | Tag-anchored (lazy) | Correct. |
| `/javascript\s*:/i` | Context-free (intentional) | Correct design decision. Marginal false-positive risk, high security value. |
| `/vbscript\s*:/i` | Context-free (intentional) | Correct. `vbscript:` essentially absent from legitimate prose. |
| `/(?:(?:href\|src)\s*=\s*['"]?\|]\()data\s*:/i` | URL-position anchored (subtask-8 change) | Correct. Anchored to href/src attribute values and Markdown link/image destinations. Prose `data:` passes correctly. |

No ReDoS risk: `[^>]*` is O(n) input-linear; `[\s\S]*?` lazy quantifiers terminate on first `>` without catastrophic backtracking.

---

## Upload Pipeline Security Assessment

**MIME allow-list:** Correctly enforced at `MediaService.assertValidMimeType` against the
configured `MEDIA_ALLOWED_MIME_TYPES` environment variable. The default allow-list (jpeg,
png, gif, webp) correctly excludes SVG. MIME validation occurs before any filesystem write.

**File size limits:** Two-layer enforcement — Multer hard cap at 20 MB during multipart
parsing, then `assertValidFileSize` against the configurable `MEDIA_UPLOAD_MAX_SIZE_BYTES`.
The max environment-config bound is also 20 MB (enforced by `parseInteger` range). No DoS
via oversized uploads is possible: Multer terminates the request before buffering completes.

**Memory storage:** `memoryStorage()` is correctly placed after the import block (subtask-8
change). The 20 MB Multer hard cap limits the per-request memory cost. Concurrent upload
pressure from many simultaneous requests is bounded by the 20 MB per-request cap, which is
acceptable given the admin-restricted upload surface for the highest-risk resource types.

**Storage key generation:** `<resourceType>/<randomUUID><ext>` — all components are
server-generated. No user-supplied path component reaches the filesystem.

**Original filename handling:** Display-only metadata; sanitized via `path.basename` +
non-word character replacement + 255-char cap at ingestion. Never used to construct filesystem
paths at upload or serve time.

**Authorization:** Admin role required for `blog-post` and `standalone-page` resource types;
any authenticated session sufficient for `blog-comment`. Session resolution via
`authService.resolveSession` correctly throws `UnauthorizedException` on missing or invalid
sessions. The order of checks (session → file present → resourceType valid → role check →
delegate to service) is correct.

**Resource type validation:** Duplicated in controller (input guard) and service
(`assertValidResourceType`). Defense-in-depth pattern; correct.

---

## Serve Path Security Assessment

**Path traversal prevention:** `getImageForServing` resolves the stored `storageKey` via
`path.resolve(storageRoot, entity.storageKey)` and then checks that the result starts with
`storageRoot + path.sep`. This guard correctly rejects a hypothetically injected DB value
containing `../../` traversal sequences. Tests confirm both `../../etc/passwd` and
`blog-post/../../../etc/passwd` are rejected.

**TOCTOU hardening:** ENOENT stream error → 404 (file vanished after DB lookup). If headers
were already flushed when the error fires, the socket is destroyed (signalling truncated
response) rather than writing a new status line. Other I/O errors → 500. Correct.

**MIME re-check at serve time:** `assertValidMimeType(entity.mimeType)` is called before
returning the file path, providing defense-in-depth against a stale or tampered DB record.

**Access control at serve:** Public serve is intentional per design. No authentication is
required to retrieve a media file by ID. This is appropriate for a content-delivery use case
where media URLs are embedded in public-facing blog posts and pages. The UUID-based ID
provides adequate obscurity (not a security mechanism, but limits enumeration).

**Range request handling:** No explicit range request handling is implemented. `fs.createReadStream`
pipes the full file. Browsers issuing `Range` requests (e.g., for video seeks) will receive
the full stream because Express/Node does not auto-handle Range headers in streaming responses.
This is a functional concern (no partial-content support) rather than a security concern —
there is no information disclosure risk from full-file streaming.

**Symlink risk:** No symlink-awareness in the `existsSync` → `createReadStream` path.
A symlink at the storage path pointing outside the storage root would bypass the `startsWith`
containment check if the symlink target resolves to a path within the root. However:
- `storageKey` is server-generated and never contains `../` components.
- The storage directory is a dedicated Docker volume with no user-controllable symlinks.
- The `startsWith` check on the resolved path of the `storageKey` value is correct given
  the current threat model; symlink injection via DB tampering would require prior database
  compromise (not in scope here).

**Risk:** Negligible for the current deployment model.

---

## Client-Side Defense-in-Depth Assessment (MarkdownRenderer)

`apps/web/components/markdown-renderer.tsx` provides a second sanitization layer:

1. `stripRawHtml` removes all `<...>` tags from the Markdown source before conversion.
   This is correctly applied as the first step, before any Markdown-to-HTML conversion.
2. `escapeHtml` is applied to all plain-text segments.
3. `sanitizeUrl` allows only `https?://`, `/`-prefixed, `./`-prefixed, and `../`-prefixed
   URLs in link and image attributes. All other schemes (including `javascript:`, `data:`,
   URL-encoded variants) produce `#` — effectively neutralized.
4. Links use `rel="noopener noreferrer" target="_blank"` — correct.
5. Images use `loading="lazy"` — correct.
6. No external Markdown library is used, minimizing third-party attack surface.

One edge case: `sanitizeUrl` allows `../` relative paths. This could theoretically be used
to construct a relative URL that navigates to an unintended page. In practice, the MarkdownRenderer
is used in a read context (blog/pages rendering); relative URLs in images or links navigate
within the web app's routing context, not the filesystem. This is acceptable.

**Assessment:** The client-side defense layer is well-implemented and provides genuine
defense-in-depth against any server-side bypass that reaches a stored content record.

---

## Sanitizer Integration Assessment (Blog and Pages Services)

**blog.service.ts:** `validateMarkdownBody` is called on post body and comment body at both
create and update paths. `normalizeMarkdownBody` is called before `validateMarkdownBody`
at all write paths. Correct ordering (normalize → validate → persist).

**pages.service.ts:** `validateMarkdownBody` is called at both create and update paths.
`normalizeMarkdownBody` is called after validation at the create path and separately at the
update path. The revision copy path normalizes from the source revision body (no re-validation
needed since the body was already validated when first stored). Correct.

No write path in either service skips the sanitizer. Coverage is complete.

---

## Test Coverage Assessment

**Sanitizer tests (markdown-sanitizer.test.ts):**
- Paired accept/reject-class pattern for event handlers: correct HTML tag context for all four
  reject cases; two prose-accept cases confirm no false positive.
- Paired accept/reject-class pattern for data: URIs: four reject cases covering all URL-position
  variants (Markdown image, Markdown link, href, src); two prose-accept cases.
- Script, dangerous-element, form, and URI scheme rejection: all tested.
- `normalizeMarkdownBody`: line-ending and trim behavior covered.

Missing but acceptable: a test documenting the HTML comment bypass (L1) as a known
limitation. This omission is deliberate (a failing test without a fix would be confusing).

**Service tests (media.service.test.ts):**
- MIME type validation: allowed types, PDF rejection, `text/html` rejection, SVG rejection.
- File size validation: within limit, over limit, error message content.
- Resource type validation: all three allowed types, unknown type, empty type.
- Upload path: bad MIME type before filesystem write, oversized before write, invalid resource type.
- Path traversal: both `../../etc/passwd` and encoded traversal variants rejected.
- MIME re-check at serve time: stored `application/octet-stream` rejected.
- TOCTOU: file absent from disk → NotFoundException.

**Controller tests (media.controller.test.ts, 14 cases):**
- Auth: 401 for no session, 403 for non-admin on admin-only resource types, 200 for all valid combinations.
- TOCTOU stream hardening: ENOENT → 404, headers-sent → socket destroy, non-ENOENT → 500.
- Happy path: Content-Type/Content-Length headers set, bytes piped correctly.

**Coverage is adequate for the stated security properties.** No material security test gaps found.

---

## Documentation Accuracy Assessment

`docs/features/media.md` is accurate and complete:
- The six rejection classes match the implementation.
- Anchoring policy (tag-context for event handlers; URL-position for data:) is described correctly.
- Prose-acceptance behavior is noted.
- `javascript:` and `vbscript:` correctly described as context-free ("any position").
- The magic-byte assumption (MIME trust from multipart header) is not explicitly documented —
  this is the gap noted in M2.
- No contradictions between doc and implementation found.

---

## Summary of Findings

| Severity | ID | Summary |
|---|---|---|
| MEDIUM | M1 | No X-Content-Type-Options: nosniff header — missing defense-in-depth |
| MEDIUM | M2 | MIME validation is header-only; no magic-byte verification; SVG must remain excluded |
| LOW | L1 | HTML comment bypass in event-handler pattern (pre-existing, non-exploitable) |
| LOW | L2 | `javascript:` context-free (intentional, correct) |
| LOW | L3 | URL-encoded scheme bypass (pre-existing, mitigated by client layer) |
| LOW | L4 | Content-Disposition filename injection (negligible, sanitized at upload) |

---

## Outcome

**CONDITIONAL PASS**

No blocking security findings. The media subsystem's upload, serve, and sanitization pipeline
is correctly implemented for its stated design contract. All substantive acceptance criteria
are satisfied. The two MEDIUM findings (M1, M2) are pre-existing or architectural gaps
unrelated to this subtask's changes and do not block safe operation of the subtask-8 changes.

**Conditions for unconditional PASS:**

1. (M1) Add `X-Content-Type-Options: nosniff` globally in the API bootstrap — recommended
   in a follow-up cycle, not required to unblock this subtask.
2. (M2) Explicitly document the magic-byte assumption in `media.service.ts` and
   `docs/features/media.md`, and add `image/svg+xml` to a deny-list for future operators
   who may modify `MEDIA_ALLOWED_MIME_TYPES` — recommended documentation update, not a
   blocking code change.

The subtask-8 changes themselves (sanitizer pattern anchoring, memoryStorage placement,
JSDoc updates) introduce no new security issues and correctly address the task-scoped scope.
The coordinator may record this subtask complete.
