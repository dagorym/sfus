/**
 * Source-contract tests for the Milestone 3 blog publishing system.
 *
 * These tests use the source-audit pattern (reading source files and asserting
 * on their content) consistent with public-shell.spec.ts and
 * authoring-components.spec.ts in this workspace.
 *
 * Acceptance criteria covered:
 *  AC1 - Admin users can manage blog posts end to end
 *  AC2 - Guests can browse and read only published blog content
 *  AC3 - Draft and scheduled content remain protected from unauthorized access
 *  AC4 - Blog APIs and routes use reusable authorization checks
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "../../");

async function readAppFile(relativePath: string): Promise<string> {
  return readFile(path.join(appRoot, relativePath), "utf8");
}

// ---------------------------------------------------------------------------
// Blog API client contracts
// ---------------------------------------------------------------------------

describe("blog-client.ts source contracts", () => {
  it("exports public listing and detail helpers with no credentials (guest access)", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    // AC2: public routes must not require credentials
    expect(source).toContain("export async function listPublishedPosts");
    expect(source).toContain("export async function getPublishedPost");
    // Public routes should not send credentials
    const publicListBlock = source.slice(
      source.indexOf("async function listPublishedPosts"),
      source.indexOf("async function getPublishedPost") + 1
    );
    expect(publicListBlock).not.toContain('credentials: "include"');
  });

  it("exports admin management helpers with credentials:include (session required)", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    // AC1: admin routes must forward session cookie
    expect(source).toContain("export async function adminListAllPosts");
    expect(source).toContain("export async function adminCreatePost");
    expect(source).toContain("export async function adminUpdatePost");
    expect(source).toContain("export async function adminPublishPost");
    expect(source).toContain("export async function adminUnpublishPost");
    expect(source).toContain("export async function adminPublishAt");
    expect(source).toContain("export async function adminDeletePost");
    // All admin routes must forward the session cookie
    const adminSection = source.slice(source.indexOf("// Admin routes"));
    expect(adminSection).toContain('credentials: "include"');
  });

  it("uses NEXT_PUBLIC_API_BASE_PATH for all requests (consistent routing)", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    expect(source).toContain('process.env.NEXT_PUBLIC_API_BASE_PATH || "/api"');
    expect(source).toContain("`${apiBase}/blog`");
  });

  it("schedule helper sends publishedAt as ISO string (adminPublishAt)", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    expect(source).toContain("publishedAt");
    expect(source).toContain("/publish-at");
  });
});

// ---------------------------------------------------------------------------
// Public blog listing page
// ---------------------------------------------------------------------------

describe("Public blog listing page source contracts (AC2)", () => {
  it("renders only using listPublishedPosts (no admin API calls)", async () => {
    const source = await readAppFile("app/blog/page.tsx");
    expect(source).toContain("listPublishedPosts");
    expect(source).not.toContain("adminListAllPosts");
    expect(source).not.toContain("adminGetPost");
  });

  it("shows all posts in a linked list", async () => {
    const source = await readAppFile("app/blog/page.tsx");
    expect(source).toContain("/blog/${encodeURIComponent(post.slug)}");
  });

  it("displays tags for each post", async () => {
    const source = await readAppFile("app/blog/page.tsx");
    expect(source).toContain("post.tags");
  });
});

// ---------------------------------------------------------------------------
// Public blog detail page
// ---------------------------------------------------------------------------

describe("Public blog detail page source contracts (AC2, AC3)", () => {
  it("uses getPublishedPost only (never reaches draft content)", async () => {
    const source = await readAppFile("app/blog/[slug]/page.tsx");
    // AC3: only published endpoint used
    expect(source).toContain("getPublishedPost");
    expect(source).not.toContain("adminGetPost");
  });

  it("uses MarkdownRenderer for body (sanitized rendering)", async () => {
    const source = await readAppFile("app/blog/[slug]/page.tsx");
    // AC1/AC4: uses shared authoring component, not bespoke inline rendering
    expect(source).toContain("MarkdownRenderer");
    expect(source).toContain('from "../../../components/markdown-renderer"');
  });

  it("shows 404 state when post is null (draft/scheduled hidden from guests)", async () => {
    const source = await readAppFile("app/blog/[slug]/page.tsx");
    // AC3: null result from getPublishedPost means not found or not published
    expect(source).toContain("post === null");
    expect(source).toContain("not yet published");
  });
});

// ---------------------------------------------------------------------------
// Admin blog list page
// ---------------------------------------------------------------------------

describe("Admin blog list page source contracts (AC1, AC4)", () => {
  it("calls resolveProtectedSession to enforce authentication (AC4)", async () => {
    const source = await readAppFile("app/admin/blog/page.tsx");
    // AC4: uses shared session resolution, not bespoke inline check
    expect(source).toContain("resolveProtectedSession");
    expect(source).toContain('"/admin/blog"');
  });

  it("checks hasGlobalRole admin before loading data (AC3)", async () => {
    const source = await readAppFile("app/admin/blog/page.tsx");
    // AC3: unauthorized users cannot access admin surface
    expect(source).toContain('hasGlobalRole');
    expect(source).toContain('"admin"');
  });

  it("provides publish and unpublish actions (AC1)", async () => {
    const source = await readAppFile("app/admin/blog/page.tsx");
    expect(source).toContain("adminPublishPost");
    expect(source).toContain("adminUnpublishPost");
  });

  it("provides delete action (AC1)", async () => {
    const source = await readAppFile("app/admin/blog/page.tsx");
    expect(source).toContain("adminDeletePost");
  });

  it("links to new post and edit pages (AC1)", async () => {
    const source = await readAppFile("app/admin/blog/page.tsx");
    expect(source).toContain('href="/admin/blog/new"');
    expect(source).toContain("/admin/blog/${post.id}/edit");
  });
});

// ---------------------------------------------------------------------------
// Admin blog create page
// ---------------------------------------------------------------------------

describe("Admin blog create page source contracts (AC1)", () => {
  it("guards the page with resolveProtectedSession and admin role check", async () => {
    const source = await readAppFile("app/admin/blog/new/page.tsx");
    expect(source).toContain("resolveProtectedSession");
    expect(source).toContain("hasGlobalRole");
    expect(source).toContain('"admin"');
  });

  it("uses adminCreatePost to create a draft", async () => {
    const source = await readAppFile("app/admin/blog/new/page.tsx");
    expect(source).toContain("adminCreatePost");
  });

  it("uses MarkdownEditor for body input (shared authoring component AC4)", async () => {
    const source = await readAppFile("app/admin/blog/new/page.tsx");
    expect(source).toContain("MarkdownEditor");
    expect(source).toContain('from "../../../../components/markdown-editor"');
  });

  it("has title, slug, tags, and body fields", async () => {
    const source = await readAppFile("app/admin/blog/new/page.tsx");
    expect(source).toContain("title");
    expect(source).toContain("slug");
    expect(source).toContain("tags");
    expect(source).toContain("body");
  });
});

// ---------------------------------------------------------------------------
// Admin blog edit page
// ---------------------------------------------------------------------------

describe("Admin blog edit page source contracts (AC1, AC3)", () => {
  it("guards the page with resolveProtectedSession and admin role check", async () => {
    const source = await readAppFile("app/admin/blog/[id]/edit/page.tsx");
    expect(source).toContain("resolveProtectedSession");
    expect(source).toContain("hasGlobalRole");
    expect(source).toContain('"admin"');
  });

  it("provides publish, unpublish, and schedule controls (AC1)", async () => {
    const source = await readAppFile("app/admin/blog/[id]/edit/page.tsx");
    expect(source).toContain("adminPublishPost");
    expect(source).toContain("adminUnpublishPost");
    expect(source).toContain("adminPublishAt");
  });

  it("uses MarkdownEditor for body editing (shared authoring component AC4)", async () => {
    const source = await readAppFile("app/admin/blog/[id]/edit/page.tsx");
    expect(source).toContain("MarkdownEditor");
  });

  it("handles schedule with a future datetime input", async () => {
    const source = await readAppFile("app/admin/blog/[id]/edit/page.tsx");
    expect(source).toContain("datetime-local");
    // The schedule form field captures a date-time value and passes it as publishedAt
    expect(source).toContain("scheduleValue");
  });

  it("uses adminUpdatePost to save content changes", async () => {
    const source = await readAppFile("app/admin/blog/[id]/edit/page.tsx");
    expect(source).toContain("adminUpdatePost");
  });
});

// ---------------------------------------------------------------------------
// Blog comment client contracts (AC2, AC3)
// ---------------------------------------------------------------------------

describe("blog-client.ts comment API contracts", () => {
  it("exports listComments without credentials (public/guest access)", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    expect(source).toContain("export async function listComments");
    // Public route must not send credentials
    const commentBlock = source.slice(
      source.indexOf("async function listComments"),
      source.indexOf("async function createComment") + 1
    );
    expect(commentBlock).not.toContain('credentials: "include"');
  });

  it("exports createComment with credentials:include (member auth required)", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    expect(source).toContain("export async function createComment");
    const createBlock = source.slice(
      source.indexOf("async function createComment"),
      source.indexOf("async function moderationListComments") + 1
    );
    expect(createBlock).toContain('credentials: "include"');
  });

  it("exports moderation functions with credentials:include (moderator/admin required)", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    expect(source).toContain("export async function moderationListComments");
    expect(source).toContain("export async function moderateCommentStatus");
    expect(source).toContain("export async function deleteComment");
    // All moderation routes must forward the session cookie
    const moderationSection = source.slice(source.indexOf("async function moderationListComments"));
    expect(moderationSection).toContain('credentials: "include"');
  });

  it("uses moderation path prefix for all moderation routes", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    // Moderation routes use /blog/moderation/comments/...
    expect(source).toContain("/blog/moderation/comments/");
  });

  it("exports BlogCommentDetail and BlogCommentStatus types", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    expect(source).toContain("BlogCommentDetail");
    expect(source).toContain("BlogCommentStatus");
  });
});

// ---------------------------------------------------------------------------
// Blog post detail page with comments (AC2, AC3)
// ---------------------------------------------------------------------------

describe("Blog post detail page comment surface contracts (AC2, AC3)", () => {
  it("imports and calls listComments for guest-visible comments", async () => {
    const source = await readAppFile("app/blog/[slug]/page.tsx");
    // AC2: public route
    expect(source).toContain("listComments");
    expect(source).toContain("from \"../blog-client\"");
  });

  it("imports createComment for authenticated member comment submission", async () => {
    const source = await readAppFile("app/blog/[slug]/page.tsx");
    expect(source).toContain("createComment");
  });

  it("uses MarkdownEditor for comment body input (shared authoring component AC4)", async () => {
    const source = await readAppFile("app/blog/[slug]/page.tsx");
    expect(source).toContain("MarkdownEditor");
    expect(source).toContain('from "../../../components/markdown-editor"');
  });

  it("uses ImageUpload with blog-comment resource type (shared upload component AC4)", async () => {
    const source = await readAppFile("app/blog/[slug]/page.tsx");
    expect(source).toContain("ImageUpload");
    expect(source).toContain('"blog-comment"');
  });

  it("reads session to determine whether to show comment form (AC2, AC3)", async () => {
    const source = await readAppFile("app/blog/[slug]/page.tsx");
    // Session-gated form: only members see it
    expect(source).toContain("readSession");
    expect(source).toContain("session");
  });

  it("renders comment list without authentication requirement (AC2)", async () => {
    const source = await readAppFile("app/blog/[slug]/page.tsx");
    // Comments list must be rendered for all users including guests
    expect(source).toContain("comments.map");
    // The section must have an aria label for accessibility
    expect(source).toContain('aria-label="Comments"');
  });

  it("does not call adminGetPost or expose draft content (AC3)", async () => {
    const source = await readAppFile("app/blog/[slug]/page.tsx");
    // AC3: only public endpoint used
    expect(source).not.toContain("adminGetPost");
    expect(source).not.toContain("adminListAllPosts");
  });
});

// ---------------------------------------------------------------------------
// AC1: publishedAt-driven visibility — scheduled label in admin UI
// ---------------------------------------------------------------------------

describe("Admin blog list scheduled-post label contracts (AC2)", () => {
  it("renders scheduled label for published+future-dated posts", async () => {
    const source = await readAppFile("app/admin/blog/page.tsx");
    // AC2: posts with status=published and publishedAt > now show a scheduled label
    expect(source).toContain("isScheduled");
    expect(source).toContain("goes live at");
  });

  it("computes isScheduled as published+publishedAt>now", async () => {
    const source = await readAppFile("app/admin/blog/page.tsx");
    // The condition distinguishes a future-dated published post from a live one
    expect(source).toContain('post.status === "published"');
    expect(source).toContain("new Date(post.publishedAt)");
  });

  it("provides toggle-featured (pin/unpin) control per post (AC5)", async () => {
    const source = await readAppFile("app/admin/blog/page.tsx");
    // AC5: admin-only pin/unpin toggle visible in list
    expect(source).toContain("adminToggleFeatured");
    expect(source).toContain("Unpin");
    expect(source).toContain("Pin");
  });
});

// ---------------------------------------------------------------------------
// AC4: Featured image — admin create/edit wires ImageUpload; public shows img
// ---------------------------------------------------------------------------

describe("Admin blog editor featured image contracts (AC4)", () => {
  it("create page imports and uses ImageUpload for featured image", async () => {
    const source = await readAppFile("app/admin/blog/new/page.tsx");
    // AC4: ImageUpload wired in admin editor
    expect(source).toContain("ImageUpload");
    expect(source).toContain("featuredImageId");
    expect(source).toContain("onUpload");
  });

  it("edit page imports and uses ImageUpload for featured image", async () => {
    const source = await readAppFile("app/admin/blog/[id]/edit/page.tsx");
    expect(source).toContain("ImageUpload");
    expect(source).toContain("featuredImageId");
  });

  it("edit page imports adminToggleFeatured for pin/unpin (AC5)", async () => {
    const source = await readAppFile("app/admin/blog/[id]/edit/page.tsx");
    expect(source).toContain("adminToggleFeatured");
  });
});

describe("Public blog listing featured image and summary contracts (AC4, AC5)", () => {
  it("renders featured image when featuredImageId is set (AC4)", async () => {
    const source = await readAppFile("app/blog/page.tsx");
    // AC4: public listing renders the featured image
    expect(source).toContain("featuredImageId");
    expect(source).toContain("/api/media/");
  });

  it("renders post summary in the listing (AC5)", async () => {
    const source = await readAppFile("app/blog/page.tsx");
    // AC5: summary shown in public listing
    expect(source).toContain("post.summary");
  });

  it("surfaces featured/pinned posts with a visual indicator (AC5)", async () => {
    const source = await readAppFile("app/blog/page.tsx");
    // AC5: isFeatured posts marked distinctly in the listing
    expect(source).toContain("post.isFeatured");
  });
});

// ---------------------------------------------------------------------------
// Admin blog create form: optional slug with auto-generation indicator
// ---------------------------------------------------------------------------

describe("Admin blog create page optional slug source contracts", () => {
  // AC: The blog admin create form accepts an empty slug and indicates auto-generation.
  it("slug input has no required attribute (slug is optional)", async () => {
    const source = await readAppFile("app/admin/blog/new/page.tsx");
    // Find the slug input section and confirm it does not have `required` immediately
    // adjacent to the slug field name.
    const slugSection = source.slice(
      source.lastIndexOf('"slug"'),
      source.indexOf('"tags"')
    );
    // The slug input must not carry a required attribute.
    expect(slugSection).not.toMatch(/\brequired\b/);
  });

  it("slug input shows an auto-generation helper hint", async () => {
    const source = await readAppFile("app/admin/blog/new/page.tsx");
    // AC: indicates auto-generation when left blank.
    expect(source).toContain("auto-generated from the title when left blank");
  });
});

// ---------------------------------------------------------------------------
// adminCreatePost error message surfacing
// ---------------------------------------------------------------------------

describe("blog-client.ts adminCreatePost error message surfacing", () => {
  // AC: adminCreatePost parses payload?.error?.message first so NestJS exception
  // filter messages surface to the caller instead of only a generic fallback.
  it("adminCreatePost error parsing reads payload.error.message before payload.message", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    const adminCreateBlock = source.slice(
      source.indexOf("export async function adminCreatePost"),
      source.indexOf("export async function adminUpdatePost")
    );
    // Must read payload?.error?.message (NestJS exception filter shape)
    expect(adminCreateBlock).toContain("payload?.error?.message");
    // Must also fall back to payload?.message
    expect(adminCreateBlock).toContain("payload?.message");
  });

  it("adminCreatePost error chain prefers error.message over the generic fallback", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    const adminCreateBlock = source.slice(
      source.indexOf("export async function adminCreatePost"),
      source.indexOf("export async function adminUpdatePost")
    );
    // The expression must chain with || so both paths are tried before the
    // hard-coded fallback message.
    const errorExpr = adminCreateBlock.match(/payload\?\.error\?\.message.*?\|\|.*?payload\?\.message.*?\|\|/s);
    expect(errorExpr).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Envelope error-chain source contracts — all admin/member/moderation calls
//
// These tests pin the payload?.error?.message || payload?.message || <fallback>
// chain at every call site so a regression to payload?.message-only cannot ship
// silently. The API's JsonExceptionFilter envelope is:
//   { error: { code, message, statusCode }, request: {...} }
// Without payload?.error?.message first, every API-layer error collapses to
// the hard-coded generic fallback.
// ---------------------------------------------------------------------------

/**
 * Helper: extract a function body from blog-client.ts source by bounding it
 * between the named export and the next export keyword.
 */
function extractFn(source: string, fnName: string): string {
  const start = source.indexOf(`export async function ${fnName}`);
  if (start === -1) throw new Error(`Function ${fnName} not found in source`);
  const nextExport = source.indexOf("\nexport ", start + 1);
  return nextExport === -1 ? source.slice(start) : source.slice(start, nextExport);
}

describe("blog-client.ts envelope error chain — all admin call sites", () => {
  // Regression guard: every function in this list must use the three-part
  // payload?.error?.message || payload?.message || <fallback> chain.
  // A payload?.message-only read (the old, broken pattern) will cause the test
  // to fail because it would never contain payload?.error?.message.

  const adminFunctions = [
    "adminListAllPosts",
    "adminGetPost",
    "adminCreatePost",
    "adminUpdatePost",
    "adminPublishPost",
    "adminUnpublishPost",
    "adminPublishAt",
    "adminToggleFeatured",
    "adminDeletePost",
  ];

  const memberAndModerationFunctions = [
    "listComments",
    "createComment",
    "adminLockComments",
    "adminUnlockComments",
    "moderationListComments",
    "moderateCommentStatus",
    "deleteComment",
  ];

  const allFunctions = [...adminFunctions, ...memberAndModerationFunctions];

  it.each(allFunctions)(
    "%s reads payload?.error?.message before payload?.message (envelope first)",
    async (fnName) => {
      const source = await readAppFile("app/blog/blog-client.ts");
      const block = extractFn(source, fnName);
      // Must contain the envelope shape read
      expect(block).toContain("payload?.error?.message");
      // Must also include the legacy fallback
      expect(block).toContain("payload?.message");
    }
  );

  it.each(allFunctions)(
    "%s uses the three-part || chain: error.message || message || <fallback>",
    async (fnName) => {
      const source = await readAppFile("app/blog/blog-client.ts");
      const block = extractFn(source, fnName);
      // The full chain must appear in the error branch
      const chain = block.match(/payload\?\.error\?\.message\s*\|\|\s*payload\?\.message\s*\|\|/s);
      expect(chain).not.toBeNull();
    }
  );

  it.each(allFunctions)(
    "%s type annotation includes error?: { message?: string } (envelope type)",
    async (fnName) => {
      const source = await readAppFile("app/blog/blog-client.ts");
      const block = extractFn(source, fnName);
      // The cast must include the envelope error sub-object
      expect(block).toContain("error?:");
      expect(block).toContain("message?:");
    }
  );
});

// ---------------------------------------------------------------------------
// AC5: blog-client summary and isFeatured type fields
// ---------------------------------------------------------------------------

describe("blog-client.ts type contracts for summary and isFeatured (AC5)", () => {
  it("BlogPostSummary includes summary and isFeatured fields", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    // AC5: types carry summary and isFeatured for listing/meta use
    expect(source).toContain("summary:");
    expect(source).toContain("isFeatured:");
  });

  it("adminToggleFeatured is exported as admin-only route (AC5)", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    // AC5: pin/unpin is admin-only; client enforces credentials:include
    expect(source).toContain("export async function adminToggleFeatured");
    expect(source).toContain("toggle-featured");
  });
});

// ---------------------------------------------------------------------------
// AC1: blog-client comment threading and lock helpers
// ---------------------------------------------------------------------------

describe("blog-client.ts comment threading and lock API contracts (AC1, AC2, AC3)", () => {
  it("listComments returns {comments, commentsLocked} shape (AC1)", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    // AC1: listComments must return both the comment list and the locked flag.
    expect(source).toContain("commentsLocked:");
    expect(source).toContain("commentsLocked: boolean");
  });

  it("createComment accepts optional parentId parameter for 1-level replies (AC1)", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    // AC1: createComment signature must accept parentId for reply threading.
    const createBlock = source.slice(
      source.indexOf("export async function createComment"),
      source.indexOf("export async function adminLockComments") + 1
    );
    expect(createBlock).toContain("parentId");
  });

  it("adminLockComments is exported with credentials:include (AC3)", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    // AC3: lock route requires moderator/admin session.
    expect(source).toContain("export async function adminLockComments");
    expect(source).toContain("lock-comments");
    const lockBlock = source.slice(
      source.indexOf("export async function adminLockComments"),
      source.indexOf("export async function adminUnlockComments") + 1
    );
    expect(lockBlock).toContain('credentials: "include"');
  });

  it("adminUnlockComments is exported with credentials:include (AC3)", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    // AC3: unlock route requires moderator/admin session.
    expect(source).toContain("export async function adminUnlockComments");
    expect(source).toContain("unlock-comments");
    const unlockBlock = source.slice(
      source.indexOf("export async function adminUnlockComments"),
      source.indexOf("// ---------------------------------------------------------------------------\n// Moderation routes")
    );
    expect(unlockBlock).toContain('credentials: "include"');
  });

  it("BlogCommentDetail includes parentId, mediaReferenceId, and replies fields (AC1, AC2)", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    // AC1: replies support; AC2: mediaReferenceId persisted.
    expect(source).toContain("parentId:");
    expect(source).toContain("mediaReferenceId:");
    expect(source).toContain("replies?:");
  });
});

// ---------------------------------------------------------------------------
// AC1, AC3: Blog post detail page renders locked state and nested replies
// ---------------------------------------------------------------------------

describe("Blog post detail page commentsLocked and reply rendering (AC1, AC3)", () => {
  it("renders a commentsLocked notice when the thread is locked (AC3)", async () => {
    const source = await readAppFile("app/blog/[slug]/page.tsx");
    // AC3: locked thread must be communicated to users.
    expect(source).toContain("commentsLocked");
    expect(source).toContain("Comments are locked");
  });

  it("hides the comment form when commentsLocked is true (AC3)", async () => {
    const source = await readAppFile("app/blog/[slug]/page.tsx");
    // AC3: comment form must not render when thread is locked.
    // The form is guarded by: commentsLocked ? null : (<form>)
    expect(source).toContain("commentsLocked ? null");
  });

  it("hides reply buttons when commentsLocked is true (AC1)", async () => {
    const source = await readAppFile("app/blog/[slug]/page.tsx");
    // AC1: reply button must not render when thread is locked.
    expect(source).toContain("!commentsLocked");
  });

  it("renders nested replies under each top-level comment (AC1)", async () => {
    const source = await readAppFile("app/blog/[slug]/page.tsx");
    // AC1: visible replies are rendered in a nested list.
    expect(source).toContain("c.replies");
    expect(source).toContain("c.replies.map");
  });

  it("renders inline reply form with parentId forwarding (AC1)", async () => {
    const source = await readAppFile("app/blog/[slug]/page.tsx");
    // AC1: reply form calls createComment with the parent comment id.
    expect(source).toContain("handleSubmitReply");
    expect(source).toContain("replyingTo");
    expect(source).toContain("parentCommentId");
  });

  it("reads commentsLocked from listComments result and tracks it in state (AC3)", async () => {
    const source = await readAppFile("app/blog/[slug]/page.tsx");
    // AC3: state correctly reflects server-side lock flag.
    expect(source).toContain("setCommentsLocked");
    expect(source).toContain("result.commentsLocked");
  });
});

// ---------------------------------------------------------------------------
// Subtask-3: Data-minimization — web mirror type BlogCommentDetail must NOT
// include authorUserId, moderatedByUserId, or moderatedAt.
// These fields are stripped server-side before the public API response is sent;
// if they appear in the client type, a type regression could allow callers to
// accidentally read or render them if they ever leak from the API.
// ---------------------------------------------------------------------------

describe("blog-client.ts BlogCommentDetail type: trimmed fields absent (subtask-3 AC5)", () => {
  it("BlogCommentDetail type does NOT include authorUserId", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    // Locate the BlogCommentDetail interface
    const interfaceStart = source.indexOf("export interface BlogCommentDetail");
    expect(interfaceStart).toBeGreaterThan(-1);
    // Find the closing brace of the interface
    const afterInterface = source.indexOf("}", interfaceStart);
    const interfaceText = source.slice(interfaceStart, afterInterface + 1);
    expect(interfaceText).not.toContain("authorUserId");
  });

  it("BlogCommentDetail type does NOT include moderatedByUserId", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    const interfaceStart = source.indexOf("export interface BlogCommentDetail");
    expect(interfaceStart).toBeGreaterThan(-1);
    const afterInterface = source.indexOf("}", interfaceStart);
    const interfaceText = source.slice(interfaceStart, afterInterface + 1);
    expect(interfaceText).not.toContain("moderatedByUserId");
  });

  it("BlogCommentDetail type does NOT include moderatedAt", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    const interfaceStart = source.indexOf("export interface BlogCommentDetail");
    expect(interfaceStart).toBeGreaterThan(-1);
    const afterInterface = source.indexOf("}", interfaceStart);
    const interfaceText = source.slice(interfaceStart, afterInterface + 1);
    expect(interfaceText).not.toContain("moderatedAt");
  });

  it("BlogCommentDetail type includes the expected public fields (positive baseline)", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    const interfaceStart = source.indexOf("export interface BlogCommentDetail");
    expect(interfaceStart).toBeGreaterThan(-1);
    const afterInterface = source.indexOf("}", interfaceStart);
    const interfaceText = source.slice(interfaceStart, afterInterface + 1);
    // Positive baseline: public fields must remain
    expect(interfaceText).toContain("id:");
    expect(interfaceText).toContain("postId:");
    expect(interfaceText).toContain("parentId:");
    expect(interfaceText).toContain("body:");
    expect(interfaceText).toContain("status:");
    expect(interfaceText).toContain("mediaReferenceId:");
    expect(interfaceText).toContain("createdAt:");
    expect(interfaceText).toContain("updatedAt:");
  });

  it("blog-client.ts as a whole has zero references to authorUserId in any comment context", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    // authorUserId must not appear anywhere after the BlogCommentDetail interface starts
    // (the only valid use of authorUserId in blog-client.ts is on BlogPostDetail for the
    // post author, which appears before BlogCommentDetail in the file).
    const commentDetailStart = source.indexOf("export interface BlogCommentDetail");
    // Verify it does NOT appear after the BlogCommentDetail interface starts
    const afterCommentInterface = source.slice(commentDetailStart);
    expect(afterCommentInterface).not.toContain("authorUserId");
  });
});

// ---------------------------------------------------------------------------
// Subtask-3: blog-client.ts JSDoc on BlogCommentDetail confirms field stripping
// ---------------------------------------------------------------------------

describe("blog-client.ts BlogCommentDetail JSDoc documents security trimming (subtask-3 AC5)", () => {
  it("JSDoc above BlogCommentDetail mentions omission of moderation-internal fields", async () => {
    const source = await readAppFile("app/blog/blog-client.ts");
    const interfaceStart = source.indexOf("export interface BlogCommentDetail");
    expect(interfaceStart).toBeGreaterThan(-1);
    // The JSDoc comment is immediately before the interface
    const jsdocWindow = source.slice(Math.max(0, interfaceStart - 400), interfaceStart);
    // Must contain a JSDoc comment describing the omission
    expect(jsdocWindow).toMatch(/omit|omits|stripped|strip|moderation.internal/i);
  });
});
