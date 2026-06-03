# Implementer Report

Status:
- success

Task summary:
- Complete MS3 media pipeline: declare multer as direct dep, add GET /api/media/:id serve endpoint with path-traversal-safe storageKey resolution, enforce role-scoped upload authorization (admin for blog-post/standalone-page; authenticated user for blog-comment), add alt-text capture to ImageUpload with unique per-instance IDs, add durable storage volume in both compose files.

Changed files:
- apps/api/package.json
- apps/api/src/media/media.controller.ts
- apps/api/src/media/media.service.ts
- apps/web/components/image-upload.module.css
- apps/web/components/image-upload.tsx
- cicd/docker/compose.dev.yml
- cicd/docker/compose.prod.yml
- pnpm-lock.yaml

Validation commands run:
- pnpm --dir apps/api typecheck
- pnpm --dir apps/api build
- pnpm --dir apps/api lint
- pnpm --dir apps/api test
- pnpm --dir apps/web typecheck
- pnpm --dir apps/web build
- pnpm --dir apps/web lint
- pnpm --dir apps/web test

Validation outcome:
- All validations passed. API: 171 tests pass, 0 lint warnings, build/typecheck clean. Web: 102 tests pass, 0 lint warnings, build/typecheck clean.

Implementation/code commit hash:
- 4880813

Artifacts written:
- artifacts/ms3-completion-and-copilot-port/subtask-2/implementer_report.md
- artifacts/ms3-completion-and-copilot-port/subtask-2/tester_prompt.txt
- artifacts/ms3-completion-and-copilot-port/subtask-2/implementer_result.json

Implementation context:
- multer is now imported as default import (import multer from 'multer') with const { memoryStorage } = multer, matching the @types/multer export = multer pattern
- MediaService.getImageForServing(id): looks up entity, resolves path with path.resolve(storageRoot, entity.storageKey), guards with startsWith(storageRoot + path.sep), asserts MIME type against allow-list, returns { filePath, mimeType, sizeBytes, originalFilename }
- MediaController GET :id: calls mediaService.getImageForServing, sets Content-Type/Content-Length/Cache-Control headers, streams with fs.createReadStream(media.filePath).pipe(res)
- MediaController POST upload: calls authService.resolveSession (throws 401 if no session), checks session.user.globalRole === 'admin' for ADMIN_ONLY_RESOURCE_TYPES=['blog-post','standalone-page'] (throws 403 if not), any authenticated user passes for blog-comment
- ImageUpload: useId() generates per-instance id for both file input (image-upload-input-${instanceId}) and alt text input (image-upload-alt-${instanceId}); altText state captured via controlled input; ImageUploadResult.altText added to interface
- MarkdownRenderer already correctly renders ![alt](url) -> <img src=... alt=... loading=lazy>; no changes needed
- compose.dev.yml: api service gets MEDIA_STORAGE_PATH=/app/storage/uploads env and sfus_media_uploads:/app/storage/uploads volume mount; sfus_media_uploads added to top-level volumes
- compose.prod.yml: api and migrate services both get MEDIA_STORAGE_PATH env and volume mount; sfus_media_uploads added to top-level volumes

Expected validation failures carried forward:
- None
