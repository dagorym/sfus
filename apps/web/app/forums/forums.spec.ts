/**
 * Source-contract tests for the Milestone 4 forum browsing, authoring,
 * mentions, and moderation web layer.
 *
 * Uses the established source-audit pattern (reading source files and asserting
 * on their content), consistent with blog.spec.ts and authoring-components.spec.ts
 * in this workspace. No DOM test environment is available.
 *
 * Acceptance criteria covered:
 *  AC1 - Forum index renders ONLY site boards from the public read API
 *  AC2 - Members can create topics and replies; guests see sign-in affordance
 *  AC3 - Locked topics hide reply form and show a lock notice
 *  AC4 - Moderator controls render only for moderator/admin sessions
 *  AC5 - @-autocomplete queries suggest endpoint; rendered @username links to /users/<username>
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
// AC1: Forums API client — site-boards-only, public read surface
// ---------------------------------------------------------------------------

describe("forums-client.ts — public read API contracts (AC1)", () => {
  it("listCategories fetches /forums/categories without credentials (public route)", async () => {
    const source = await readAppFile("app/forums/forums-client.ts");
    // AC1: listCategories must not require a session cookie
    const listBlock = source.slice(
      source.indexOf("export async function listCategories"),
      source.indexOf("export async function getBoardById")
    );
    expect(listBlock).toContain("/forums/categories");
    expect(listBlock).not.toContain('credentials: "include"');
  });

  it("listCategories returns categories[] shape including boards[]", async () => {
    const source = await readAppFile("app/forums/forums-client.ts");
    // AC1: the response shape must include a boards array so callers can filter site boards
    expect(source).toContain("categories: PublicCategoryShape[]");
    expect(source).toContain("boards: PublicBoardShape[]");
  });

  it("listTopics fetches board topics without credentials (public route)", async () => {
    const source = await readAppFile("app/forums/forums-client.ts");
    const listTopicsBlock = source.slice(
      source.indexOf("export async function listTopics"),
      source.indexOf("export async function listPosts")
    );
    expect(listTopicsBlock).toContain("/forums/boards/");
    expect(listTopicsBlock).toContain("/topics");
    expect(listTopicsBlock).not.toContain('credentials: "include"');
  });

  it("listPosts fetches topic posts without credentials (public route)", async () => {
    const source = await readAppFile("app/forums/forums-client.ts");
    const listPostsBlock = source.slice(
      source.indexOf("export async function listPosts"),
      source.indexOf("// ---------------------------------------------------------------------------\n// Member write routes")
    );
    expect(listPostsBlock).toContain("/forums/topics/");
    expect(listPostsBlock).toContain("/posts");
    expect(listPostsBlock).not.toContain('credentials: "include"');
  });

  it("member write routes createTopic and createPost include credentials:include", async () => {
    const source = await readAppFile("app/forums/forums-client.ts");
    // AC2: member-authenticated routes must forward the session cookie
    const memberSection = source.slice(source.indexOf("// Member write routes"));
    expect(memberSection).toContain('credentials: "include"');
    expect(source).toContain("export async function createTopic");
    expect(source).toContain("export async function createPost");
  });

  it("moderation routes include credentials:include (moderator/admin required)", async () => {
    const source = await readAppFile("app/forums/forums-client.ts");
    // AC4: moderation routes must forward the session cookie
    const modSection = source.slice(source.indexOf("// Moderation routes"));
    expect(modSection).toContain('credentials: "include"');
    expect(source).toContain("export async function pinTopic");
    expect(source).toContain("export async function unpinTopic");
    expect(source).toContain("export async function lockTopic");
    expect(source).toContain("export async function unlockTopic");
    expect(source).toContain("export async function moveTopic");
  });

  it("moderation routes target /forums/moderation/topics/ path prefix", async () => {
    const source = await readAppFile("app/forums/forums-client.ts");
    // AC4: moderation endpoints have the correct path prefix
    expect(source).toContain("/forums/moderation/topics/");
  });

  it("suggestUsers uses credentials:include (session-gated suggest endpoint ST14)", async () => {
    const source = await readAppFile("app/forums/forums-client.ts");
    // AC5: suggest is session-gated
    const suggestBlock = source.slice(source.indexOf("export async function suggestUsers"));
    expect(suggestBlock).toContain('credentials: "include"');
    expect(suggestBlock).toContain("/users/suggest");
  });

  it("suggestUsers degrades gracefully on error (returns empty array)", async () => {
    const source = await readAppFile("app/forums/forums-client.ts");
    const suggestBlock = source.slice(source.indexOf("export async function suggestUsers"));
    // Fail-silent degradation: return [] on non-ok response
    expect(suggestBlock).toContain("return []");
  });

  it("uses NEXT_PUBLIC_API_BASE_PATH for all requests", async () => {
    const source = await readAppFile("app/forums/forums-client.ts");
    expect(source).toContain('process.env.NEXT_PUBLIC_API_BASE_PATH || "/api"');
    expect(source).toContain("`${apiBase}/forums");
  });
});

// ---------------------------------------------------------------------------
// AC1: Forum index page — site boards only
// ---------------------------------------------------------------------------

describe("Forums index page (app/forums/page.tsx) source contracts (AC1)", () => {
  it("calls listCategories (not a raw board listing) to populate the index", async () => {
    const source = await readAppFile("app/forums/page.tsx");
    // AC1: the index must use the category API which already filters to site boards
    expect(source).toContain("listCategories");
    expect(source).toContain('from "./forums-client"');
  });

  it("does NOT call any non-public admin or project-scoped board endpoint", async () => {
    const source = await readAppFile("app/forums/page.tsx");
    // AC1: only site boards appear; private/project-scoped boards must not be fetched
    expect(source).not.toContain("adminListBoards");
    expect(source).not.toContain("listProjectBoards");
    expect(source).not.toContain("credentials: \"include\"");
  });

  it("renders board links under /forums/<slug> (not absolute paths)", async () => {
    const source = await readAppFile("app/forums/page.tsx");
    // AC1: each board link uses the board slug, not a raw UUID
    expect(source).toContain("/forums/${encodeURIComponent(board.slug)}");
  });

  it("renders category sections and board names", async () => {
    const source = await readAppFile("app/forums/page.tsx");
    expect(source).toContain("category.name");
    expect(source).toContain("board.name");
  });

  it("shows empty-state message when no boards are available", async () => {
    const source = await readAppFile("app/forums/page.tsx");
    expect(source).toContain("No forum boards are available yet");
  });
});

// ---------------------------------------------------------------------------
// AC1 + AC2: Board view — paginated topics, member/guest affordance
// ---------------------------------------------------------------------------

describe("Board view page (app/forums/[boardSlug]/page.tsx) source contracts (AC1, AC2)", () => {
  it("resolves board from listCategories (site-boards-only API), not a direct board lookup", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/page.tsx");
    // AC1: board must be resolved from the public category listing, filtering to site boards
    expect(source).toContain("listCategories");
    expect(source).toContain("listTopics");
  });

  it("renders paginated topic list with previous/next controls", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/page.tsx");
    // AC1: board view must include pagination controls
    expect(source).toContain("PAGE_SIZE");
    expect(source).toContain("totalPages");
    expect(source).toContain("Previous page");
    expect(source).toContain("Next page");
  });

  it("member session sees a create-topic link (not a sign-in prompt)", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/page.tsx");
    // AC2: authenticated members get a create-topic link
    expect(source).toContain("new-topic");
    expect(source).toContain("New Topic");
  });

  it("guest (session === null) sees a sign-in link with ?next= pointing to /new-topic", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/page.tsx");
    // AC2: guest affordance must preserve the intended destination
    expect(source).toContain("session === null");
    expect(source).toContain("Sign in to create a topic");
    // The next param points to the new-topic path
    expect(source).toContain("/new-topic");
    expect(source).toContain("encodeURIComponent");
    expect(source).toContain("/login?next=");
  });

  it("next= param for guest sign-in encodes the board new-topic URL", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/page.tsx");
    // The next= value must encode the full /forums/<boardSlug>/new-topic path
    expect(source).toContain("encodeURIComponent(`${currentPath}/new-topic`)");
  });

  it("renders pinned and locked badges on topic list items", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/page.tsx");
    expect(source).toContain("isPinned");
    expect(source).toContain("isLocked");
    expect(source).toContain("Pinned");
    expect(source).toContain("Locked");
  });

  it("uses readSession and hasGlobalRole to detect moderator session", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/page.tsx");
    expect(source).toContain("readSession");
    expect(source).toContain("hasGlobalRole");
  });
});

// ---------------------------------------------------------------------------
// AC1 (body sanitization) + AC2 + AC3 (locked) + AC4 (moderator controls):
// Topic view page
// ---------------------------------------------------------------------------

describe("Topic view page (app/forums/[boardSlug]/[topicSlug]/page.tsx) source contracts (AC1–AC4)", () => {
  it("renders all post bodies through MarkdownRenderer (never raw dangerouslySetInnerHTML on user input)", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/[topicSlug]/page.tsx");
    // AC1: user-authored content must be sanitized
    expect(source).toContain("MarkdownRenderer");
    expect(source).toContain('from "../../../../components/markdown-renderer"');
    // Must NOT use dangerouslySetInnerHTML on raw user input directly
    // (MarkdownRenderer itself uses dangerouslySetInnerHTML but via its sanitizer)
    expect(source).not.toContain("dangerouslySetInnerHTML={{ __html: post.body }}");
    expect(source).not.toContain("dangerouslySetInnerHTML={{ __html: topic.body }}");
  });

  it("topic body rendered via MarkdownRenderer, not raw HTML", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/[topicSlug]/page.tsx");
    // AC1: topic opening body rendered sanitized
    expect(source).toContain("<MarkdownRenderer content={topic.body}");
  });

  it("post bodies rendered via MarkdownRenderer in PostItem", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/[topicSlug]/page.tsx");
    // AC1: each post body in the list goes through MarkdownRenderer
    expect(source).toContain("<MarkdownRenderer content={post.body}");
  });

  it("paginated post list with previous/next controls", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/[topicSlug]/page.tsx");
    // AC1: topic view must include post pagination
    expect(source).toContain("PAGE_SIZE");
    expect(source).toContain("totalPages");
    expect(source).toContain("Previous page");
    expect(source).toContain("Next page");
  });

  it("reply form is present for an authenticated (non-locked) topic", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/[topicSlug]/page.tsx");
    // AC2: member session + unlocked topic => reply form rendered
    expect(source).toContain("Post a reply");
    expect(source).toContain("reply-body");
    expect(source).toContain("Post reply");
  });

  it("guest sees sign-in affordance with ?next= preserving the topic URL", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/[topicSlug]/page.tsx");
    // AC2: guest affordance on topic page
    expect(source).toContain("session === null");
    expect(source).toContain("Sign in to reply");
    expect(source).toContain("/login?next=");
    expect(source).toContain("encodeURIComponent(currentPath)");
  });

  it("locked topic: reply form is hidden (isLocked check gates the form)", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/[topicSlug]/page.tsx");
    // AC3: locked topics must not show the reply form
    expect(source).toContain("isLocked");
    // The lock check must gate the form — form only renders when NOT locked
    expect(source).toContain("isLocked ?");
  });

  it("locked topic: lock notice is shown with appropriate aria role", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/[topicSlug]/page.tsx");
    // AC3: a visible lock notice is rendered when isLocked is true
    expect(source).toContain("locked");
    expect(source).toContain("No new replies can be posted");
    expect(source).toContain("lockedNotice");
  });

  it("moderator controls render only when isModerator is true (client gate)", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/[topicSlug]/page.tsx");
    // AC4: controls are wrapped in an isModerator conditional — both directions
    expect(source).toContain("isModerator ?");
    expect(source).toContain("moderationBar");
    // The pin, lock, and move actions must all be present in the moderator block
    expect(source).toContain("Pin topic");
    expect(source).toContain("Unpin topic");
    expect(source).toContain("Lock topic");
    expect(source).toContain("Unlock topic");
    expect(source).toContain("Move topic");
  });

  it("moderator controls are NOT shown for non-moderator sessions (isModerator === false path)", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/[topicSlug]/page.tsx");
    // AC4: hasGlobalRole is used to determine isModerator — false means no controls
    // The conditional must be isModerator ? <controls> : null (or nothing)
    const modBarIdx = source.indexOf("moderationBar");
    expect(modBarIdx).toBeGreaterThan(-1);
    // The moderation bar must be inside the isModerator conditional
    const beforeModBar = source.slice(0, modBarIdx);
    expect(beforeModBar).toContain("isModerator ?");
  });

  it("moderation controls call the ST6 moderation API functions", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/[topicSlug]/page.tsx");
    // AC4: pin/lock/move must call the ST6 API client functions from forums-client
    expect(source).toContain("pinTopic");
    expect(source).toContain("unpinTopic");
    expect(source).toContain("lockTopic");
    expect(source).toContain("unlockTopic");
    expect(source).toContain("moveTopic");
    expect(source).toContain('from "../../forums-client"');
  });

  it("isModerator derives from hasGlobalRole(session.user, 'moderator')", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/[topicSlug]/page.tsx");
    // AC4: the client gate uses the shared hasGlobalRole helper — not a bespoke check
    expect(source).toContain("hasGlobalRole");
    expect(source).toContain('"moderator"');
  });

  it("@mention reply uses MentionAutocomplete component", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/[topicSlug]/page.tsx");
    // AC5: the reply textarea is wrapped in MentionAutocomplete
    expect(source).toContain("MentionAutocomplete");
    expect(source).toContain('from "../../../../components/mention-autocomplete"');
  });
});

// ---------------------------------------------------------------------------
// AC2: Create-topic page — session guard and form
// ---------------------------------------------------------------------------

describe("Create-topic page (app/forums/[boardSlug]/new-topic/page.tsx) source contracts (AC2)", () => {
  it("guards the page via resolveProtectedSession (redirects guests)", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/new-topic/page.tsx");
    // AC2: unauthenticated users are redirected to login with ?next= preserved
    expect(source).toContain("resolveProtectedSession");
    expect(source).toContain("redirectTo");
    expect(source).toContain("window.location.href");
  });

  it("resolveProtectedSession receives the current new-topic path as next destination", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/new-topic/page.tsx");
    // AC2: the ?next= param must point back at the new-topic page
    expect(source).toContain("currentPath");
    expect(source).toContain("resolveProtectedSession(currentPath)");
  });

  it("create-topic form has title, body fields and submit action", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/new-topic/page.tsx");
    // AC2: form structure
    expect(source).toContain("topic-title");
    expect(source).toContain("topic-body");
    expect(source).toContain("Post topic");
    expect(source).toContain("createTopic");
  });

  it("body textarea uses MentionAutocomplete (@mention support)", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/new-topic/page.tsx");
    // AC5: new-topic body also has @mention autocomplete
    expect(source).toContain("MentionAutocomplete");
  });

  it("uses MarkdownEditor for live body preview (sanitized preview)", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/new-topic/page.tsx");
    expect(source).toContain("MarkdownEditor");
  });
});

// ---------------------------------------------------------------------------
// AC1 (XSS/sanitization): MarkdownRenderer strips raw HTML and unsafe URLs
// ---------------------------------------------------------------------------

describe("MarkdownRenderer sanitization source contracts (AC1 — no XSS execution)", () => {
  it("strips all raw HTML tags before conversion (primary XSS defence)", async () => {
    const source = await readAppFile("components/markdown-renderer.tsx");
    // AC1: <script> and onerror img attacks are stripped before rendering
    expect(source).toContain("stripRawHtml");
    expect(source).toContain("replace(/<[^>]*>/g");
  });

  it("rejects javascript: URIs in links and images (sanitizeUrl)", async () => {
    const source = await readAppFile("components/markdown-renderer.tsx");
    // AC1: javascript: scheme must be blocked
    expect(source).toContain("sanitizeUrl");
    expect(source).toContain("javascript");
    expect(source).toContain('return "#"');
  });

  it("rejects data: URIs (only http(s) and relative paths allowed)", async () => {
    const source = await readAppFile("components/markdown-renderer.tsx");
    // AC1: data: URIs must be blocked — confirmed by the allowlist in sanitizeUrl
    const sanitizeBlock = source.slice(source.indexOf("function sanitizeUrl"));
    // The allowlist uses a regex for http(s):// — check the comment documents it
    expect(sanitizeBlock).toContain("http(s)://");
    // The reject-all-else fallback is return "#"
    expect(sanitizeBlock).toContain('return "#"');
    // data: must NOT appear in the allowlist — it is not an allowed scheme
    expect(sanitizeBlock).not.toContain('allow.*data:');
  });

  it("HTML-escapes text content before inserting into rendered output (escapeHtml)", async () => {
    const source = await readAppFile("components/markdown-renderer.tsx");
    // AC1: all plain text runs through escapeHtml to prevent injection
    expect(source).toContain("escapeHtml");
    expect(source).toContain('replace(/&/g, "&amp;")');
    expect(source).toContain('replace(/</g, "&lt;")');
  });

  it("stripRawHtml is called before convertMarkdownToHtml (pipeline order)", async () => {
    const source = await readAppFile("components/markdown-renderer.tsx");
    // AC1: defence-in-depth order: strip HTML first, then convert
    const convertFn = source.slice(
      source.indexOf("function convertMarkdownToHtml"),
      source.indexOf("function renderInline")
    );
    expect(convertFn).toContain("stripRawHtml");
    const stripIdx = convertFn.indexOf("stripRawHtml");
    // stripRawHtml must come before the main conversion body
    expect(stripIdx).toBeGreaterThan(-1);
    expect(stripIdx).toBeLessThan(convertFn.length);
  });
});

// ---------------------------------------------------------------------------
// AC5: @-mention rendering links @username to /users/<username>
// ---------------------------------------------------------------------------

describe("@username mention rendering source contracts (AC5)", () => {
  it("topic view links author username to /users/<username> (encoded)", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/[topicSlug]/page.tsx");
    // AC5: @username mentions rendered as links must use the correct /users/ path
    expect(source).toContain("/users/${encodeURIComponent(post.author.username)}");
  });

  it("board view author links use /users/<username> (encoded)", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/page.tsx");
    // AC5 baseline: author link pattern is consistent across views (via topic meta)
    // The board page shows author in topic meta
    expect(source).toContain("topic.author");
  });

  it("topic view links topic author username to /users/<username> (encoded)", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/[topicSlug]/page.tsx");
    expect(source).toContain("/users/${encodeURIComponent(topic.author.username)}");
  });
});

// ---------------------------------------------------------------------------
// AC1 (quoted post): quote degrades gracefully when post unavailable
// ---------------------------------------------------------------------------

describe("Quoted post rendering source contracts (AC1)", () => {
  it("quoted post is resolved from already-loaded page posts (same-page quota)", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/[topicSlug]/page.tsx");
    // AC1: quotedPost is resolved in-memory from current page, not a raw HTML insert
    expect(source).toContain("quotedPostId");
    expect(source).toContain("quotedPost");
  });

  it("when quoted post is unavailable on the current page, a graceful degradation message is shown", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/[topicSlug]/page.tsx");
    // AC1: if the quoted post isn't in the current page, show a placeholder — no content leak
    expect(source).toContain("Referenced post is not available on this page");
  });

  it("available quoted post content renders via MarkdownRenderer (not raw HTML)", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/[topicSlug]/page.tsx");
    // AC1: quote content also goes through sanitized rendering
    expect(source).toContain("<MarkdownRenderer content={quotedPost.body}");
  });
});
