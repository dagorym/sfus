# Implementer Report

Status:
- success

Task summary:
- ST17 — Web: public profile page + avatar upload & display. Added /users/[username] public profile page (five-field allowlist enforced via profileProjection()), UserAvatar component with initials fallback, avatar upload/remove in /profile using ImageUpload(resourceType='avatar') wired to ST15 API, and avatar display in mention-autocomplete results.

Changed files:
- apps/web/app/auth-client.ts
- apps/web/app/profile/page.tsx
- apps/web/app/users/[username]/page.tsx
- apps/web/app/users/users-profile.spec.ts
- apps/web/components/image-upload.tsx
- apps/web/components/mention-autocomplete.tsx
- apps/web/components/user-avatar.module.css
- apps/web/components/user-avatar.spec.ts
- apps/web/components/user-avatar.tsx

Validation commands run:
- pnpm --dir <worktree> install --frozen-lockfile
- <worktree>/node_modules/.bin/vitest run --root apps/web
- pnpm typecheck
- pnpm lint

Validation outcome:
- pass

Implementation/code commit hash:
- cecfa16

Artifacts written:
- artifacts/milestone-4-forums/ST17/implementer_report.md
- artifacts/milestone-4-forums/ST17/tester_prompt.txt
- artifacts/milestone-4-forums/ST17/implementer_result.json

Implementation context:
- UserAvatar component (user-avatar.tsx) renders avatar from /api/media/<id> gated URL, falls back to uppercase initials on null or image-load error — never shows broken image.
- profileProjection() in users/[username]/page.tsx enforces strict five-field allowlist — any extra fields in the API response are silently dropped.
- Avatar upload in /profile uses ImageUpload(resourceType='avatar') then calls setAvatar(mediaId) → PUT /api/users/me/avatar; remove avatar calls DELETE /api/users/me/avatar.
- mention-autocomplete.tsx now renders UserAvatar (24px) for each suggestion item (avatar display in autocomplete results).
- ImageUploadResourceType union in image-upload.tsx extended with 'avatar' type.
- setAvatar() and removeAvatar() helpers added to auth-client.ts; ProfilePayload extended with optional avatarUrl field.

Expected validation failures carried forward:
- None
