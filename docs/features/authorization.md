# Authorization

Reusable global-role + ACL authorization decisions, and the per-feature management gates
built on top of them.

**Code:** `apps/api/src/authorization/`; gates in `blog.service.ts`, `pages.service.ts`,
`navigation.service.ts`, `media.controller.ts`; client mirror in `apps/web/app/auth-client.ts`
**Related:** [auth](auth.md) for how sessions carry `globalRole`

## Global roles

`GlobalRole` = `user` (0) < `moderator` (1) < `admin` (2).

`AuthorizationService.hasGlobalRole(actorRole, requiredRole)` is rank-based: true when the
actor's rank ≥ the required rank. `null`/unknown roles always fail.

## Generic decision contract

`AuthorizationService.evaluate(input)` decides `read` | `write` | `admin` actions over a
generic resource (`resourceType`, `resourceId`, `ownerUserId`, `visibility`, optional
`projectId`). Decision order (first match wins):

1. **global-admin** — actor has `admin` → allow.
2. **global-moderator** — actor has `moderator`, action ≠ `admin`, and resource visibility ≠
   `private` → allow.
3. **visibility-open** — action is `read` and visibility is `public` or `unlisted` → allow.
4. **authentication-required** — no `actor.userId` → deny.
5. **resource-owner** — `actor.userId === resource.ownerUserId` → allow.
6. **acl-grant** — an `authorization_grants` row for `(subjectUserId, resourceType,
   resourceId)` whose ACL role rank covers the action: `viewer` (read) < `editor` (write) <
   `owner` (admin) → allow.
7. **member-visibility** / **project-visibility** — `read` on `members` visibility, or `read`
   on `project-only` when `actor.projectIds` contains `resource.projectId` → allow.
8. **access-denied** — deny.

`assertAllowed(input)` throws `ForbiddenException` (`Authorization denied: <reason>.`) on deny.

Visibility values: `public` | `unlisted` | `members` | `project-only` | `private`.

This contract currently backs the account-scoped profile/settings routes (resource type
`account`); later content milestones are expected to reuse it rather than invent new checks.

## Per-feature management gates

Content management uses one reusable gate per service instead of inline role checks:

| Gate | Requires | Used by |
|---|---|---|
| `BlogService.assertAdminManagementAccess(role)` | `admin` | every admin blog handler |
| `PagesService.assertAdminManagementAccess(role)` | `admin` | every admin pages handler |
| `NavigationService.assertAdminManagementAccess(role)` | `admin` | every admin navigation handler |
| `BlogService.assertModerationAccess(role)` | `moderator` or `admin` | comment moderation + lock/unlock handlers |
| Media upload role check (in `MediaController`) | `admin` for `blog-post`/`standalone-page` uploads; any session for `blog-comment` | `POST /api/media/upload` |

Every gated handler calls its gate **before any data operation**. The uniform error contract:
`401` with no session, `403` when the session's role is insufficient. New admin-managed
features must follow this pattern.

## Client-side mirror (UX only)

`apps/web/app/auth-client.ts` exports `hasGlobalRole(user, requiredRole)` (same rank
ordering) and `canAccessPrivateAccount(session, targetUserId, action)` (self always; admin
always; moderator read-only). Admin web pages use these to gate the UI after
`resolveProtectedSession()` — this is convenience only; the API role checks above are the
enforcement boundary.
