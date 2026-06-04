# Verifier Report

## Scope reviewed

MS3 media pipeline completion (subtask-2). Reviewed combined Implementer (commit 4880813), Tester (commit a44a81e), and Documenter (commit 0be9a26) changes on branch `ms3-subtask-2-tester-20260603` against base `ms3-claude` (110e4e7).

Changed files reviewed:
- `apps/api/package.json` — multer direct dependency declaration
- `apps/api/src/media/media.controller.ts` — GET serve endpoint, role-scoped upload authorization, multer default import
- `apps/api/src/media/media.service.ts` — getImageForServing method with path traversal guard
- `apps/web/components/image-upload.tsx` — alt text capture, useId, unique per-instance DOM ids
- `apps/web/components/image-upload.module.css` — alt text row/label/input styles
- `cicd/docker/compose.dev.yml` — sfus_media_uploads volume, MEDIA_STORAGE_PATH env
- `cicd/docker/compose.prod.yml` — sfus_media_uploads volume, MEDIA_STORAGE_PATH env (api + migrate)
- `pnpm-lock.yaml` — multer@2.1.1 lockfile entry
- `apps/api/src/media/media.service.test.ts` — 8 new getImageForServing tests
- `apps/api/src/media/media.controller.test.ts` — 7 new upload authorization tests
- `apps/web/components/authoring-components.spec.ts` — 6 new alt-text/useId source-inspection tests
- `docs/README.md` — serve endpoint, role-scoped policy, altText field, useId behavior, volume paragraph
- `docs/website-launch-guide.md` — media API surface, volume wiring, updated user workflow step

## Acceptance criteria / plan reference

`plans/ms3-completion-and-copilot-port-plan.md`, Subtask 2 acceptance criteria (lines 103–109):
- AC1: multer declared dep, controller uses default import
- AC2: GET /api/media/:id — path traversal rejected, NotFoundException for missing record/file, MIME allow-list enforced
- AC3: upload authorization — 401 unauthenticated, 403 non-admin on blog-post/standalone-page, 200 admin, 200 authenticated user on blog-comment
- AC4: alt text capture + unique IDs — altText state/setter, altText in ImageUploadResult interface, useId import, per-instance inputId/altInputId bound to DOM id attributes
- AC5: durable storage volume — compose.dev.yml and compose.prod.yml contain sfus_media_uploads volume and MEDIA_STORAGE_PATH env var

## Convention files considered

- `AGENTS.md` — workflow, role boundaries, and single-source-of-truth doc rules
- `CLAUDE.md` — pointer to AGENTS.md
- `docs/README.md` — canonical architecture and API contract doc
- `docs/website-launch-guide.md` — startup and user workflow doc

## Acceptance Criteria Evaluation

**AC1 — multer declared dep:** SATISFIED.
- `apps/api/package.json` line 24: `"multer": "^2.0.0"` in `dependencies`.
- `apps/api/package.json` line 33: `"@types/multer": "^1.4.12"` in `devDependencies`.
- `apps/api/src/media/media.controller.ts` line 17: `import multer from "multer"` (default import).
- `pnpm-lock.yaml` confirms `multer@2.1.1` is locked.

**AC2 — GET /api/media/:id serve:** SATISFIED.
- Path traversal: `media.service.ts` lines 123–127 use `path.resolve(storageRoot, entity.storageKey)` and guard with `!resolvedPath.startsWith(storageRoot + path.sep) && resolvedPath !== storageRoot`. Covers `../` and encoded traversal sequences. Tests validate with `../../etc/passwd` and `blog-post/../../../etc/passwd`.
- NotFoundException for missing record: line 117–119. NotFoundException for absent file: lines 129–131.
- MIME allow-list enforcement: line 134 `assertValidMimeType(entity.mimeType)` throws `BadRequestException` for disallowed MIME types.
- Controller (lines 138–151) sets `Content-Type`, `Content-Length`, `Cache-Control: public, max-age=31536000, immutable` headers and streams the file.

**AC3 — upload authorization:** SATISFIED.
- `resolveSession` (controller line 85–87) throws `UnauthorizedException` (401) for unauthenticated requests.
- `ADMIN_ONLY_RESOURCE_TYPES = ["blog-post", "standalone-page"]` (controller line 39); non-admin throws `ForbiddenException` (403) at lines 100–107.
- Admin passes for blog-post and standalone-page. Authenticated non-admin passes for blog-comment (no admin check for that resource type).

**AC4 — alt text capture + unique IDs:** SATISFIED.
- `image-upload.tsx` line 88: `const [altText, setAltText] = useState("")` — controlled state.
- `ImageUploadResult` interface line 35: `altText: string`.
- Line 22: `useId` imported from React.
- Lines 80–82: `instanceId = useId()`, `inputId = image-upload-input-${instanceId}`, `altInputId = image-upload-alt-${instanceId}`.
- DOM binding: line 166 `id={altInputId}` (alt input), line 183 `id={inputId}` (file input).
- Label binding: line 162 `htmlFor={altInputId}`, line 186 `htmlFor={inputId}`.
- Result construction line 143: `{ ...serverResult, altText: altText.trim() }`.

**AC5 — durable storage volume:** SATISFIED.
- `compose.dev.yml`: `MEDIA_STORAGE_PATH: /app/storage/uploads` env (line 29), `sfus_media_uploads:/app/storage/uploads` volume mount (line 36), `sfus_media_uploads:` in top-level volumes (line 54).
- `compose.prod.yml`: env in api (line 29) and migrate (line 44) services, volume mount in api (line 34) and migrate (line 50), `sfus_media_uploads:` in top-level volumes (line 53).

## Findings

### NOTE

- `apps/api/src/media/media.controller.ts`:149 — **No error handler on fs.createReadStream for the serve endpoint**

  `fs.createReadStream(media.filePath).pipe(res)` has no `.on('error', ...)` handler. If the file is deleted in the TOCTOU window between the `existsSync` check (line 129) and `createReadStream` (line 149), Node.js will emit an unhandled error event that may produce a 500 instead of a clean 404. Risk is low in practice (storageKey is server-generated and files are not routinely removed), but adding a stream error handler would make the failure mode deterministic and prevent potential unhandled rejection warnings in newer Node.js versions.

- `apps/api/src/media/media.controller.ts`:19 — **const declaration interspersed between import statements**

  `const { memoryStorage } = multer;` (line 19) appears between two `import` blocks. This is syntactically valid TypeScript and the linter passes (0 warnings confirmed by tester). However, the non-idiomatic placement — a `const` declaration between two `import` statements — may confuse tooling or future contributors. The conventional pattern is to place all `import` statements first, then any module-level `const` declarations.

## Test sufficiency assessment

Coverage is strong across all five acceptance criteria.

- `media.service.test.ts`: 8 new `getImageForServing` tests cover missing record (NotFoundException), missing file on disk (NotFoundException), `../../etc/passwd` path traversal (BadRequestException), encoded traversal `blog-post/../../../etc/passwd` (BadRequestException), disallowed MIME type (BadRequestException), valid happy-path result shape, filePath containment within storage root, and correct path for a valid PNG storageKey.
- `media.controller.test.ts`: 7 new tests cover the complete upload auth matrix — unauthenticated (401), non-admin on blog-post (403), non-admin on standalone-page (403), admin on blog-post (200), admin on standalone-page (200), authenticated non-admin on blog-comment (200), admin on blog-comment (200).
- `authoring-components.spec.ts`: 6 new source-inspection tests verify altText state/setter presence, `altText: string` in the interface, `useId` import, per-instance id patterns (`image-upload-input-`, `image-upload-alt-`), file input `id={inputId}` binding, and alt input `id={altInputId}` binding.

Minor gaps (NOTE level only): no test verifies stream error handling in the serve controller endpoint, and `altText.trim()` behavior is not covered by a component-level test. Neither gap creates meaningful delivery risk.

Final test counts per tester: API 185/185, Web 107/107, typecheck clean, lint 0 warnings.

## Documentation accuracy assessment

`docs/README.md` is accurate and complete: the GET `/api/media/:id` endpoint description covers path-traversal safety, public read access, MIME allow-list enforcement, `Cache-Control` headers, and 404/400 error conditions. The role-scoped upload policy (admin for blog-post/standalone-page, authenticated user for blog-comment, 401/403 codes) is correctly stated. `ImageUploadResult.altText` and `useId` per-instance ID behavior are documented. The `sfus_media_uploads` volume paragraph correctly describes both dev and prod compose files including the migrate service.

`docs/website-launch-guide.md` is accurate: the media API surface section correctly states upload role requirements and the public serve endpoint. The storage volume note correctly explains that `MEDIA_STORAGE_PATH` is set automatically in the containerized stack. User workflow step 4 correctly reflects the alt-text input field and `![altText](url)` insertion pattern.

No contradictions, stale references, or duplication found between the two doc files or between documentation and implementation.

## Verdict

**PASS**

All five acceptance criteria are fully satisfied. No blocking or warning findings. Two note-level observations (stream error handler gap and interspersed const placement) are low-risk and do not affect correctness, security, or test coverage. All 185 API tests and 107 web tests pass; typecheck and lint are clean.
