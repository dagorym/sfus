# Implementer Report — ms3-landing-refresh-and-review-followups subtask-4

## Task

Enforce the full public-visibility predicate (`status = published AND publishedAt <= now`) in the `listComments` UUID-fallback path of `BlogController`. Previously, the UUID fallback only checked `status === "published"`, allowing a future-scheduled post addressed by its UUID to return 200 with an empty comments payload instead of 404.

## Changes Made

### `apps/api/src/blog/blog.service.ts`

Added `findPublishedById(id: string): Promise<BlogPostEntity | null>` — identical visibility predicate to `findPublishedBySlug` (`status: "published"`, `publishedAt: LessThanOrEqual(now)`), but looks up by `id` instead of `slug`. This reuses the existing `LessThanOrEqual` import and mirrors the documented pattern in `findPublished`/`findPublishedBySlug`.

### `apps/api/src/blog/blog.controller.ts`

Updated `listComments()` UUID-fallback from:
```typescript
await this.blogService.findById(postId).then((p) => (p?.status === "published" ? p : null));
```
to:
```typescript
await this.blogService.findPublishedById(postId);
```

This eliminates the incomplete predicate (missing `publishedAt <= now` check) and replaces it with a single call that enforces the same two-part visibility gate as every other public surface.

## Validation

- `npx --yes pnpm@10.0.0 --filter @sfus/api exec vitest run src/blog/blog.service.test.ts`: 62 tests PASS
- `npx --yes pnpm@10.0.0 typecheck`: PASS for all workspaces
- `npx --yes pnpm@10.0.0 lint`: Pre-existing failure in `navigation.controller.test.ts` (`UnauthorizedException` unused import) — not introduced by this change, confirmed by stash test, out of scope.
- `npx --yes pnpm@10.0.0 test`: Pre-existing failure in `navigation.controller.test.ts` (ENOENT path issue) — not introduced by this change, out of scope.

## Implementation Commit

`58c14ed`

## Security Notes

This subtask is marked security-review-required. The fix closes a publication-leakage vector: future-scheduled blog posts addressed by UUID on the public `GET /api/blog/:postId/comments` route previously returned 200 + empty comments array instead of 404, leaking post existence. After this fix, the route enforces the same predicate as all other public surfaces.
