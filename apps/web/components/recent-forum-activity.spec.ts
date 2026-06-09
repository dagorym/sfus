/**
 * Source-contract tests for the RecentForumActivity component.
 *
 * Uses the source-audit pattern (reading source files and asserting on their
 * content) consistent with public-shell.spec.ts, recent-posts-feed.spec.ts,
 * and other specs in this workspace.
 *
 * Acceptance criteria covered:
 *  AC1 - RecentForumActivity is a 'use client' component
 *  AC2 - Loading state, empty state, and error state are present
 *  AC3 - Topics rendered link to /forums/<boardSlug>/<topicSlug>; shows title and meta
 *  AC4 - Error state is non-fatal (no throw)
 *  AC5 - Link segments are encoded with encodeURIComponent
 *  AC6 - No dangerouslySetInnerHTML; all text is React text nodes
 *  AC7 - Fetches from listRecentTopics in forums-client
 *  AC8 - "View the forums ->" link target is /forums
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

describe("RecentForumActivity component source contracts", () => {
  it("is declared as a client component (AC1)", async () => {
    const source = await readWebFile("components/recent-forum-activity.tsx");
    expect(source).toMatch(/^["']use client["']/);
  });

  it("imports listRecentTopics from forums-client (AC7)", async () => {
    const source = await readWebFile("components/recent-forum-activity.tsx");
    expect(source).toContain("listRecentTopics");
    expect(source).toContain("forums-client");
  });

  it("shows loading state while fetching (AC2)", async () => {
    const source = await readWebFile("components/recent-forum-activity.tsx");
    expect(source).toContain("Loading recent forum activity");
  });

  it("shows empty state when no topics are returned (AC2)", async () => {
    const source = await readWebFile("components/recent-forum-activity.tsx");
    expect(source).toContain("No forum activity yet.");
    expect(source).toContain("topics.length === 0");
  });

  it("shows non-fatal error state on fetch failure (AC2, AC4)", async () => {
    const source = await readWebFile("components/recent-forum-activity.tsx");
    expect(source).toContain("Could not load recent forum activity.");
    // Error is caught — catch() sets state rather than re-throwing
    expect(source).toContain(".catch(");
    expect(source).toContain("setError(");
  });

  it("checks error state before topics state (AC2 — error renders before empty check)", async () => {
    const source = await readWebFile("components/recent-forum-activity.tsx");
    const errorCheckIdx = source.indexOf("error !== null");
    const topicsNullIdx = source.indexOf("topics === null");
    expect(errorCheckIdx).toBeGreaterThan(-1);
    expect(topicsNullIdx).toBeGreaterThan(-1);
    expect(errorCheckIdx).toBeLessThan(topicsNullIdx);
  });

  it("uses useState for topics and error state (AC2)", async () => {
    const source = await readWebFile("components/recent-forum-activity.tsx");
    expect(source).toContain("useState");
    expect(source).toContain("useEffect");
  });

  it("renders topic titles as links to /forums/<boardSlug>/<topicSlug> (AC3, AC5)", async () => {
    const source = await readWebFile("components/recent-forum-activity.tsx");
    // Link path must include board slug and topic slug segments
    expect(source).toContain("/forums/");
    expect(source).toContain("topic.board.slug");
    expect(source).toContain("topic.slug");
    // Dynamic URL segments must use encodeURIComponent (AC5)
    expect(source).toContain("encodeURIComponent");
    // Title is rendered as a text node inside the link
    expect(source).toContain("topic.title");
  });

  it("renders board name and author in meta (AC3)", async () => {
    const source = await readWebFile("components/recent-forum-activity.tsx");
    expect(source).toContain("topic.board.name");
    expect(source).toContain("topic.author");
  });

  it("does not use dangerouslySetInnerHTML (AC6)", async () => {
    const source = await readWebFile("components/recent-forum-activity.tsx");
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });

  it("includes a View the forums link pointing to /forums (AC8)", async () => {
    // This link is in page.tsx, not the component — assert the page embeds the component with the link
    const pageSource = await readWebFile("app/page.tsx");
    expect(pageSource).toContain("RecentForumActivity");
    expect(pageSource).toContain('href="/forums"');
    // The "View the forums" link must be present
    expect(pageSource).toContain("View the forums");
  });

  it("forums-client exports RecentTopicItem type and listRecentTopics function (AC7)", async () => {
    const clientSource = await readWebFile("app/forums/forums-client.ts");
    expect(clientSource).toContain("RecentTopicItem");
    expect(clientSource).toContain("listRecentTopics");
    // Must call /forums/recent endpoint
    expect(clientSource).toContain("/forums/recent");
    // Must not require credentials (public endpoint)
    // The listRecentTopics function should not include credentials: "include"
    const fnStart = clientSource.indexOf("export async function listRecentTopics");
    const fnEnd = clientSource.indexOf("\n}", fnStart);
    const fnBody = clientSource.slice(fnStart, fnEnd);
    expect(fnBody).not.toContain('credentials: "include"');
  });

  it("imports RecentTopicItem type from forums-client (AC7)", async () => {
    const source = await readWebFile("components/recent-forum-activity.tsx");
    expect(source).toContain("RecentTopicItem");
  });
});
