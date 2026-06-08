# Documenter Report — ST10

## Story
Blog explicit-slug duplicate-key -> 409. `BlogService.create()` (explicit caller-supplied slug)
and `BlogService.update()` (slug-changing) now map a duplicate-key DB error to a 409
ConflictException ("A post with this slug already exists.") instead of a raw 500, reusing the
existing `isDuplicateKeyError()` helper. The auto-derived slug retry path is unchanged.

## Documentation Changes

### `docs/features/blog.md`

**Validation rules — Slug bullet** (formerly a single paragraph):

The original text described only the auto-derived slug 409 and ended with "Explicit slugs
supplied by the caller are saved once with no retry (the caller owns uniqueness for that path)"
— no mention of what happens when the explicit slug collides.

Updated to split the slug behavior into two clearly-labelled sub-bullets:
- **Explicit slug (create or update):** saved once without retry; duplicate-key DB error maps
  to `409 Conflict` ("A post with this slug already exists."). Covers both `create()` with an
  explicit slug and `update()` when `slug` is supplied and collides.
- **Auto-derived slug (create only):** retry up to 3 times on TOCTOU duplicate-key failures;
  `409 Conflict` on exhaustion ("Could not generate a unique slug after several attempts…").

**API route table — admin POST and PATCH rows:**

Added "`When slug is supplied and already in use → 409 Conflict.`" to both
`POST /api/blog/admin/posts` and `PATCH /api/blog/admin/posts/:id` to make the
slug-collision status code discoverable at the route level without reading the validation
rules section.

## Commit

- Documentation commit: `8661a5a47815a7607aa6e9b5ac7c8be08b8cb731`

## Result

PASS — documentation updated, no behavioral changes.
