# Documenter Report — ST17

**Status:** PASS
**Subtask:** ST17 — Web: public profile page + avatar upload & display
**Branch:** ms4-st17-documenter-20260608
**Documentation commit:** ea31ce4

## Documentation scope

ST17 shipped:
- A public profile page at `/users/<username>` rendering only the five ST14-allowed fields
  (`username`, `displayName`, `avatar`, `bio`, `joinDate`), enforced by a `profileProjection()`
  allowlist that drops extra keys from the API response at runtime.
- An avatar upload/replace/remove control in `/profile` using `ImageUpload` (`resourceType="avatar"`)
  wired to the ST15 `PUT`/`DELETE /api/users/me/avatar` API.
- A reusable `UserAvatar` display component (`apps/web/components/user-avatar.tsx`) with
  uppercase-initials fallback on missing avatar or image-load error (no broken image).
  Used on the public profile, forum topic/post author bylines (ST16), and mention-autocomplete
  results (ST16).
- Usernames in `/users/<username>` links are `encodeURIComponent`-encoded (ST16 convention).

## Documentation files changed

### docs/features/web-shell.md
- Added `/users/<username>` row to the route map (public access, five-field public profile,
  `UserAvatar` reference).
- Added "Profile page — avatar upload/replace/remove (ST17)" section: describes the
  `ImageUpload` + `PUT /api/users/me/avatar` flow, the remove button, and the ST15 enforcement
  boundary.
- Added "UserAvatar display component (ST17)" section: usage sites (public profile, forum
  bylines, autocomplete), fallback behavior (initials on null src or image error), security
  constraint (gated `/api/media/<id>` path only), and `encodeURIComponent` encoding for links.

### docs/features/auth.md
- Added "Profile and avatar web surface (ST17)" section with two sub-sections:
  - "Public profile page — /users/\<username\>": `profileProjection()` allowlist, five
    permitted fields, `UserAvatar` usage, 404 and error-state rendering.
  - "Avatar upload/replace/remove — /profile": `ImageUpload` + `PUT /api/users/me/avatar`
    bind flow, remove-avatar flow, and explicit note that client control is UX only (ST15
    API enforces ownership).

## Files NOT changed

- `docs/features/forums.md` — ST17 did not change forum internals. The forums doc already
  notes that bylines show the avatar (documented by ST16). No update needed.
- `docs/features/media.md` — the `avatar` resourceType and magic-byte verification are
  already documented (ST11/ST12/ST15). No new behavior from ST17.
- All product code and test files — unchanged per documenter constraints.

## Validation note

Web test matrix: 407 tests PASS (28 new ST17 specs), typecheck 0 errors, lint clean
(as reported by the Tester). Documented behavior is consistent with the implemented diff.

## Artifacts written

- `artifacts/milestone-4-forums/ST17/documenter_report.md` (this file)
- `artifacts/milestone-4-forums/ST17/documenter_result.json`
- `artifacts/milestone-4-forums/ST17/security_prompt.txt`
