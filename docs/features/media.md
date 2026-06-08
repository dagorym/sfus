# Media & Markdown Sanitization

Shared image upload/serve API, the server-side Markdown sanitizer used by every content
write path, and the reusable authoring web components.

**Code:** `apps/api/src/media/` (incl. `markdown-sanitizer.ts`),
`apps/web/components/image-upload.tsx`, `markdown-editor.tsx`, `markdown-renderer.tsx`
**Related:** [blog](blog.md), [pages](pages.md) consume the sanitizer and `ImageUpload` ·
[launch](../operations/launch.md) for the `MEDIA_*` env contract and the uploads volume

## API routes

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/media/upload?resourceType=<type>` | session; `admin` role for `blog-post` / `standalone-page`, any session for `blog-comment` | multipart `file` field. Returns `{ id, storageKey, url, mimeType, sizeBytes, originalFilename, createdAt }` where `url` is `/api/media/<id>`. `401` no session, `403` insufficient role, `400` missing file / bad `resourceType` / disallowed MIME / magic-byte mismatch / over size limit. |
| GET | `/api/media/:id` | — (public) | Streams the file with `Content-Type`, `Content-Length`, `Content-Disposition: inline; filename="<sanitized>"`, and `Cache-Control: public, max-age=31536000, immutable`. `404` record or file missing; `400` stored MIME no longer in the allow-list or storage-key containment failure. |

`resourceType` must be `blog-post`, `standalone-page`, or `blog-comment`. Write-time
authorization controls what gets stored; the serve endpoint is intentionally public and does
not re-authenticate readers.

## Upload pipeline

- Server-side MIME allow-list (`MEDIA_ALLOWED_MIME_TYPES`) and size limit
  (`MEDIA_UPLOAD_MAX_SIZE_BYTES`) are authoritative; violations → `400` with a readable
  message. (Multer additionally hard-caps request size at 20 MB before this check.)
- **Magic-byte (content-sniffing) verification:** after the MIME allow-list check, the
  server reads the file's leading bytes and compares them against the known signatures for
  each allowed image type (JPEG: `FF D8 FF`; PNG: `89 50 4E 47 ...`; GIF87a/GIF89a;
  WebP: `RIFF....WEBP`). If the signature does not match the declared content type the
  upload is rejected with `400` even when the `Content-Type` header names an allowed MIME
  type. This catches polyglot files and mislabelled uploads. The check applies to every
  image resourceType (`blog-post`, `standalone-page`, `blog-comment`). SVG
  (`image/svg+xml`) is excluded from both the MIME allow-list and magic-byte signatures
  because SVG files can embed executable content.
- Storage key: `<resourceType>/<uuid><ext>` under `MEDIA_STORAGE_PATH`; the extension is
  mapped from MIME (`.jpg`/`.png`/`.gif`/`.webp`; unmapped types get no extension).
- `originalFilename` is display-only metadata, sanitized before persistence: directory parts
  stripped (`path.basename`), non-word characters → `_`, capped at 255 chars. It is never
  used to build filesystem paths.

## Serve hardening

- Path containment: even though `storageKey` is server-generated, the resolved path must stay
  under `MEDIA_STORAGE_PATH` — a corrupted/injected DB value cannot escape the storage root
  (`400` if it tries).
- Defence-in-depth MIME re-check at serve time (`400` when the stored type is no longer
  allowed).
- TOCTOU stream handling: if the file vanishes between the DB lookup and the stream open,
  `ENOENT` → `404`; if headers were already flushed when a stream error fires, the socket is
  destroyed (signalling a truncated response) instead of writing a new status; other I/O
  errors → `500`.

## Markdown sanitizer (server-side)

`apps/api/src/media/markdown-sanitizer.ts` — used by **all** content write paths (blog posts,
comments, standalone pages):

- `validateMarkdownBody(body): { safe: true } | { safe: false, reason }` — rejects content
  matching any of six classes:
  1. **Script tags** — `<script>` / `</script>`.
  2. **Event-handler attributes** — `on<word>=` inside an HTML tag context
     (e.g. `<img onerror=…>`, `<a onclick=…>`). Bare prose such as
     "the onclick = handler pattern" is **not** rejected.
  3. **Dangerous embedding elements** — `<iframe>`, `<object>`, `<embed>`.
  4. **Form interaction elements** — `<form>`, `<input>`, `<button>`.
  5. **Dangerous URI schemes** — `javascript:`, `vbscript:` (any position).
  6. **`data:` URIs in URL positions** — matched only when the `data:` token
     appears in an `href`/`src` attribute value or a Markdown link/image
     destination (`](data:`). Prose such as "training data: source A" is
     **not** rejected.
- `normalizeMarkdownBody(body): string` — normalizes line endings to LF and trims surrounding
  whitespace; no content changes, no validation.

Contract: callers normalize, then validate, and reject with `400` before persisting anything
that fails. Do not add a write path that skips this.

## Web components

- **`MarkdownEditor`** — fully controlled write/preview toggle (`value`, `onChange`,
  `placeholder`, `rows`, `label`, `disabled`, `id`). Owns no body state; preview renders via
  `MarkdownRenderer`.
- **`MarkdownRenderer`** — renders stored Markdown as sanitized HTML. Strips **all** raw HTML
  tags before conversion (client-side defence-in-depth on top of the server sanitizer),
  converts a safe subset (headings, bold, italic, inline code, fenced code, blockquotes,
  unordered lists, links, images), and rejects non-`http(s)`/relative URI schemes in link and
  image attributes (rejected URLs become `#`). Links open with
  `rel="noopener noreferrer" target="_blank"`; images are lazy-loaded. No external Markdown
  library.
- **`ImageUpload`** — shared upload widget (`resourceType`, `onUpload`, `onError`,
  `apiBasePath`, `disabled`, `label`). Posts multipart to the upload route with
  `credentials: "include"`; surfaces `401` as an authentication-required message; performs an
  early client-side `image/*` check as a UX aid only. On success calls
  `onUpload({ ...serverResult, altText })` — `altText` comes from the widget's alt-text
  input (client-side; the server does not return it) so callers can insert
  `![altText](url)` into the Markdown body. Uses `useId()`-derived DOM ids so multiple
  instances can coexist on one page.

## Module wiring

`MediaModule.register(environment)` is a dynamic module: imports
`AuthModule.register(environment)` (session resolution on upload) and exports `MediaService` +
its `TypeOrmModule` for reuse by content modules. `MediaReferenceEntity` rows
(`media_references` table) are what `featuredImageId` / `featuredMediaId` / comment `imageId`
fields must reference.
