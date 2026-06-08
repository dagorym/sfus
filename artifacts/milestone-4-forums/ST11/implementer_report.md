# Implementer Report

Status:
- success

Task summary:
- ST11 — Magic-byte (content-sniffing) verification for all image uploads. Added a dedicated helper module image-magic-bytes.ts with byte-signature checks for JPEG, PNG, GIF87a, GIF89a, and WebP. Wired assertValidMagicBytes into MediaService.uploadImage so every upload (for all 3 current resourceTypes: blog-post, standalone-page, blog-comment) is rejected (400) when the file's leading bytes do not match the declared MIME type, even when the content-type header is in the allow-list. SVG remains excluded from both the MIME allow-list and magic-byte signatures. Closes deferred security finding M2.

Changed files:
- apps/api/src/media/image-magic-bytes.ts (new — dedicated content-sniffing helper)
- apps/api/src/media/media.service.ts (import + assertValidMagicBytes method + call in uploadImage)
- apps/api/src/media/media.service.test.ts (validFile buffer updated to real JPEG magic bytes FF D8 FF)

Validation commands run:
- npx --yes pnpm@10.0.0 lint
- npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run src/media/

Validation outcome:
- PASS — lint clean across all workspaces; 67 media module tests pass (22 service + 11 controller + 34 sanitizer). Pre-existing failure: src/http.integration.test.ts cannot resolve supertest (ST7 artifact, not caused by ST11).

Implementation/code commit hash:
- dcedd8f

Artifacts written:
- artifacts/milestone-4-forums/ST11/implementer_report.md
- artifacts/milestone-4-forums/ST11/tester_prompt.txt
- artifacts/milestone-4-forums/ST11/implementer_result.json

Implementation context:
- image-magic-bytes.ts exports sniffImageMimeType(buf: Buffer): string | null and imageMagicBytesMatch(buf: Buffer, claimedMimeType: string): boolean
- Signatures: JPEG = [0xFF, 0xD8, 0xFF]; PNG = [0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]; GIF87a = [0x47,0x49,0x46,0x38,0x37,0x61]; GIF89a = [0x47,0x49,0x46,0x38,0x39,0x61]; WebP = RIFF????WEBP (12 bytes, positions 4-7 are wildcard null)
- MIN_SNIFF_BYTES=12; buffer shorter than this returns null from sniffImageMimeType and false from imageMagicBytesMatch
- imageMagicBytesMatch returns false for any claimedMimeType not in IMAGE_SIGNATURES (catches SVG, PDF, etc.)
- assertValidMagicBytes in MediaService.service.ts throws BadRequestException('File content does not match the declared content type. Upload rejected.') on mismatch
- assertValidMagicBytes is called in uploadImage after assertValidMimeType (MIME allow-list) but before assertValidFileSize and assertValidResourceType
- validFile.buffer in media.service.test.ts is now [0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01] — real JPEG JFIF header bytes
- SVG is not in IMAGE_SIGNATURES and not in the MIME allow-list; it is rejected at the MIME check layer and would also fail the magic-byte check
- The 3 current resourceTypes (blog-post, standalone-page, blog-comment) all go through uploadImage so all get the check automatically
- avatar resourceType from ST12 will also get the check when added since it uses the same uploadImage path

Expected validation failures carried forward:
- src/http.integration.test.ts — supertest not installed; pre-existing from ST7, not caused by ST11 changes
