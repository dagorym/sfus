/**
 * Source-contract tests for the RecentPostsFeed component.
 *
 * Uses the source-audit pattern (reading source files and asserting on their
 * content) consistent with public-shell.spec.ts and blog.spec.ts in this
 * workspace.
 *
 * Acceptance criteria covered:
 *  AC1 - RecentPostsFeed is a 'use client' component
 *  AC2 - Loading state, empty state, and error state are present
 *  AC3 - Up to 3 posts rendered; each links to /blog/<slug>; shows title, summary, date
 *  AC4 - Error state is non-fatal (no throw)
 *  AC5 - page.tsx remains a server component (no fetch/useEffect at top level)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");

async function readWebFile(relativePath: string): Promise<string> {
  return readFile(path.join(webRoot, relativePath), "utf8");
}

describe("RecentPostsFeed component source contracts", () => {
  it("is declared as a client component (AC1)", async () => {
    // AC1: RecentPostsFeed must be 'use client' since it uses useState/useEffect
    const source = await readWebFile("components/recent-posts-feed.tsx");
    expect(source).toMatch(/^["']use client["']/);
  });

  it("uses listPublishedPosts from blog-client and slices to 3 (AC3)", async () => {
    // AC3: fetches from blog-client and caps at 3 posts
    const source = await readWebFile("components/recent-posts-feed.tsx");
    expect(source).toContain("listPublishedPosts");
    expect(source).toContain("slice(0, 3)");
  });

  it("shows loading state while fetching (AC2)", async () => {
    // AC2: renders a loading message before data arrives (posts === null initial state)
    const source = await readWebFile("components/recent-posts-feed.tsx");
    expect(source).toContain("Loading recent posts");
  });

  it("shows empty state when no posts are returned (AC2)", async () => {
    // AC2: renders a graceful empty message when posts.length === 0
    const source = await readWebFile("components/recent-posts-feed.tsx");
    expect(source).toContain("No posts yet.");
    expect(source).toContain("posts.length === 0");
  });

  it("shows non-fatal error state on fetch failure (AC2, AC4)", async () => {
    // AC2: renders error message; AC4: error is caught and set in state, not thrown
    const source = await readWebFile("components/recent-posts-feed.tsx");
    expect(source).toContain("Could not load recent posts.");
    // Error is caught — catch() sets state rather than re-throwing
    expect(source).toContain(".catch(");
    expect(source).toContain("setError(");
  });

  it("renders post titles as links to /blog/<slug> (AC3)", async () => {
    // AC3: each post title links to its /blog/<slug> detail page
    const source = await readWebFile("components/recent-posts-feed.tsx");
    expect(source).toContain("/blog/${post.slug}");
    // Link must wrap or render the post title
    expect(source).toContain("post.title");
  });

  it("renders post summary when available (AC3)", async () => {
    // AC3: summary field is rendered per post
    const source = await readWebFile("components/recent-posts-feed.tsx");
    expect(source).toContain("post.summary");
  });

  it("renders formatted publishedAt date when available (AC3)", async () => {
    // AC3: publishedAt is formatted and rendered per post
    const source = await readWebFile("components/recent-posts-feed.tsx");
    expect(source).toContain("post.publishedAt");
    expect(source).toContain("toLocaleDateString");
  });

  it("imports BlogPostSummary type from blog-client (AC3)", async () => {
    // AC3: uses the canonical type for post shape
    const source = await readWebFile("components/recent-posts-feed.tsx");
    expect(source).toContain("BlogPostSummary");
    expect(source).toContain("blog-client");
  });

  it("uses useState for posts and error state (AC2)", async () => {
    // AC2: component manages loading/error/data states internally
    const source = await readWebFile("components/recent-posts-feed.tsx");
    expect(source).toContain("useState");
    expect(source).toContain("useEffect");
  });

  it("checks error state before posts state (AC2 — error renders before empty check)", async () => {
    // AC2: error check must precede posts null/empty check so both paths are distinct
    const source = await readWebFile("components/recent-posts-feed.tsx");
    const errorCheckIdx = source.indexOf("error !== null");
    const postsNullIdx = source.indexOf("posts === null");
    expect(errorCheckIdx).toBeGreaterThan(-1);
    expect(postsNullIdx).toBeGreaterThan(-1);
    expect(errorCheckIdx).toBeLessThan(postsNullIdx);
  });
});
