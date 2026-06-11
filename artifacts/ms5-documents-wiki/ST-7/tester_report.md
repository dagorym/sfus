# Tester Report — ST-7: Public /docs Browse and Render Surface (Web)

## Testing Scope

**Task:** ST-7: Build the public /docs browse and render surface (web) for Milestone 5.

**Implementation files under test:**
- `apps/web/app/docs/docs-client.ts`
- `apps/web/app/docs/docs.module.css`
- `apps/web/app/docs/page.tsx` (DocsIndexPage)
- `apps/web/app/docs/[...path]/page.tsx` (DocsPageView)

**Test files created:**
- `apps/web/app/docs/docs-index.spec.ts` (17 tests)
- `apps/web/app/docs/docs-page.spec.ts` (27 tests)
- `apps/web/app/docs/docs-client.spec.ts` (41 tests)

**Artifact directory:** `artifacts/ms5-documents-wiki/ST-7`

**Assumptions:**
- Tests use the source-audit pattern (file read + string assertions), consistent with `blog.spec.ts`, `forums.spec.ts`, and other web specs in this project. No DOM test environment is available in the worktree.
- Lint was validated by running from the main repo's node_modules installation, as the worktree's node_modules is not fully installed. The main repo lint passed cleanly.
- `next build` was validated by running from the implementer's worktree (`ms5-st7-implementer-20260611`) which has the same code and proper node_modules. The build passes and shows both `/docs` and `/docs/[...path]` routes.

## Test Execution Results

### New docs spec tests (tester worktree)
- **docs-index.spec.ts:** 17/17 PASS
- **docs-page.spec.ts:** 27/27 PASS  
- **docs-client.spec.ts:** 41/41 PASS
- **Total new tests:** 85 PASS, 0 FAIL

### Full web spec suite (tester worktree)
- **Test files:** 17 passed, 2 failed (pre-existing)
- **Tests:** 640 passed, 0 failed
- **Pre-existing failures:** `components/authoring-components.spec.ts` and `components/user-avatar.spec.ts` — both fail with `ERR_MODULE_NOT_FOUND: Cannot find package 'react'`, a worktree environment issue caused by missing `node_modules/.pnpm` tree. These failures existed before this tester run and are not caused by the ST-7 implementation or test changes.

### Lint
- Passed (run from main repo node_modules): `apps/web lint: Done`, `apps/api lint: Done`

### next build
- Passed (run from implementer worktree `ms5-st7-implementer-20260611`):
  - `/docs` and `/docs/[...path]` routes compile and appear in the build manifest.
  - No TypeScript or ESLint errors.

## Acceptance Criteria Coverage

### AC1: /docs renders site page tree; /docs/<path> renders page with breadcrumb trail and sanitized Markdown
**PASS**

- DocsIndexPage calls `getDocPageTree()` and renders page links under `/docs/<page.path>`.
- Empty state, loading state, and error state (role=alert) all verified.
- `hasChildren` hint verified.
- DocsPageView uses `useParams` to join catch-all segments, calls `getDocPageByPath(fullPath)`.
- Breadcrumb nav has `aria-label="Breadcrumb"` with `<ol>`, includes root `/docs` link, ancestor crumbs from `page.breadcrumbs`, and current page span with `aria-current="page"`.
- Page content rendered via `<MarkdownRenderer content={page.currentRevision.body}>` — no `dangerouslySetInnerHTML` on raw body.
- Revision summary, number, and author displayed.
- "No content yet" fallback when `currentRevision` is null.

### AC2: Non-staff/anonymous visitor sees no create/edit/lock affordances; staff session sees them (hasGlobalRole client gate)
**PASS**

- Both pages import `readSession` and `hasGlobalRole` from `auth-client`.
- `isStaff = hasGlobalRole(session.user, "moderator")` pattern verified.
- DocsIndexPage: "Create page" link (href="/docs/new") is inside `isStaff ?` conditional; non-staff branch renders null.
- DocsPageView: Edit, History, and Acquire lock links inside `isStaff ?` conditional; non-staff branch renders null.
- Acquire lock hidden when page is already locked (`!isLocked` guard).
- Lock banner (`lockBanner`, `role="status"`) rendered for all users (not gated by isStaff) when `isLocked` is true — banner appears before the isStaff block.
- Lock computed from `page.lock.isLocked && page.lock.lockExpiresAt !== null && new Date(lockExpiresAt) > new Date()`.

### AC3: Nonexistent/gated path renders the standard not-found experience with no oracle distinction
**PASS**

- `page === null` branch renders "Document not found" heading.
- Not-found message says "does not exist or is not publicly accessible" — no oracle distinction between missing and access-denied.
- Does not contain "You do not have permission" or "access denied".
- Back to Documents link present in not-found state.

### AC4: next build and lint pass; route files export only default
**PASS**

- Both route files export only `export default function <Name>` — no `export const metadata`, `export async function generateMetadata`, `export const revalidate`, `export const dynamic`, or `export const generateStaticParams`.
- Neither file contains `dangerouslySetInnerHTML`.
- Lint: passed.
- Build: passed (verified in implementer worktree showing /docs and /docs/[...path] routes).

## Commit Information

- **Test commit hash:** `58d7f6d`
- **Branch:** `ms5-st7-tester-20260611`
- **Files committed:** `apps/web/app/docs/docs-client.spec.ts`, `apps/web/app/docs/docs-index.spec.ts`, `apps/web/app/docs/docs-page.spec.ts`

## Cleanup

No temporary non-handoff byproducts were created. The `apps/web/package.json` and `pnpm-lock.yaml` modifications from the failed `next build` attempt in the tester worktree were discarded via `git checkout` before commit.

## Result

**PASS** — All 85 new tests pass. All 4 acceptance criteria are verified by the source-contract test suite. Implementation defects: none detected.
