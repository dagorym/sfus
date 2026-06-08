/**
 * Source-contract tests for the MentionAutocomplete component.
 *
 * Uses the established source-audit pattern (reading source files and asserting
 * on their content), consistent with authoring-components.spec.ts and blog.spec.ts.
 * No DOM test environment (jsdom / @testing-library/react) is available in this workspace.
 *
 * Acceptance criteria covered:
 *  AC5 - @-autocomplete queries the ST14 suggest endpoint on @prefix input;
 *        inserted result places @username into the editor;
 *        rendered @username links go to /users/<username> (encoded);
 *        component never renders user-supplied HTML.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const componentsRoot = __dirname;
const appRoot = path.resolve(__dirname, "../");

async function readComponent(name: string): Promise<string> {
  return readFile(path.join(componentsRoot, name), "utf8");
}

async function readAppFile(relativePath: string): Promise<string> {
  return readFile(path.join(appRoot, relativePath), "utf8");
}

// ---------------------------------------------------------------------------
// AC5: MentionAutocomplete queries the suggest endpoint
// ---------------------------------------------------------------------------

describe("MentionAutocomplete source contracts — suggest endpoint integration (AC5)", () => {
  it("imports suggestUsers from forums-client (uses the ST14 suggest endpoint)", async () => {
    const source = await readComponent("mention-autocomplete.tsx");
    // AC5: must call the correct suggest function, not a bespoke user listing
    expect(source).toContain("suggestUsers");
    expect(source).toContain('from "../app/forums/forums-client"');
  });

  it("calls suggestUsers with the typed prefix (fragment after @)", async () => {
    const source = await readComponent("mention-autocomplete.tsx");
    // AC5: the query is the text after the @-trigger, not a full reload
    expect(source).toContain("suggestUsers");
    expect(source).toContain("debouncedFetch");
    // The detect function extracts fragment after "@" and passes it to the debounced fetch
    expect(source).toContain("fragment");
    expect(source).toContain("debouncedFetch(fragment)");
  });

  it("debounces the suggest call to avoid hammering the endpoint on every keystroke", async () => {
    const source = await readComponent("mention-autocomplete.tsx");
    // AC5: debounce is required for rate-limit compliance
    expect(source).toContain("useDebounce");
    expect(source).toContain("setTimeout");
  });

  it("only triggers for a valid username prefix (alphanumeric/underscore/hyphen)", async () => {
    const source = await readComponent("mention-autocomplete.tsx");
    // AC5: avoids spurious fetches on arbitrary content after @
    expect(source).toContain("/^[a-zA-Z0-9_-]{0,30}$/");
    expect(source).toContain("mentionStartRef");
  });

  it("detects @-trigger only at word boundaries (not mid-word)", async () => {
    const source = await readComponent("mention-autocomplete.tsx");
    // AC5: @mention must be triggered at a word boundary, not embedded in another token
    expect(source).toContain("detectMention");
    expect(source).toContain("charBefore");
  });
});

// ---------------------------------------------------------------------------
// AC5: MentionAutocomplete inserts @username into the editor on selection
// ---------------------------------------------------------------------------

describe("MentionAutocomplete source contracts — insertion behavior (AC5)", () => {
  it("insertSuggestion builds '@username ' (plain text, not HTML)", async () => {
    const source = await readComponent("mention-autocomplete.tsx");
    // AC5: inserted handle is plain text — no HTML injection
    expect(source).toContain("insertSuggestion");
    expect(source).toContain("`${before}@${item.username} ${after}`");
  });

  it("insertSuggestion replaces the current @fragment (not appending)", async () => {
    const source = await readComponent("mention-autocomplete.tsx");
    // AC5: the fragment from the @ position to the cursor is replaced
    expect(source).toContain("mentionStartRef.current");
    expect(source).toContain("value.slice(0, mentionStart)");
    expect(source).toContain("value.slice(cursorPos)");
  });

  it("dropdown is closed and mentionStartRef cleared after insertion", async () => {
    const source = await readComponent("mention-autocomplete.tsx");
    // AC5: dropdown disappears after selection
    expect(source).toContain("setShowDropdown(false)");
    expect(source).toContain("mentionStartRef.current = null");
  });

  it("cursor is moved to just after the inserted mention (requestAnimationFrame)", async () => {
    const source = await readComponent("mention-autocomplete.tsx");
    // AC5: ergonomic cursor placement after insertion
    expect(source).toContain("requestAnimationFrame");
    expect(source).toContain("setSelectionRange");
  });
});

// ---------------------------------------------------------------------------
// AC5: MentionAutocomplete dropdown accessibility and keyboard navigation
// ---------------------------------------------------------------------------

describe("MentionAutocomplete source contracts — keyboard accessibility (AC5)", () => {
  it("ArrowDown moves active suggestion index down", async () => {
    const source = await readComponent("mention-autocomplete.tsx");
    // AC5: keyboard navigation required
    expect(source).toContain("ArrowDown");
    expect(source).toContain("setActiveIndex");
  });

  it("ArrowUp moves active suggestion index up", async () => {
    const source = await readComponent("mention-autocomplete.tsx");
    expect(source).toContain("ArrowUp");
  });

  it("Enter or Tab selects the highlighted suggestion", async () => {
    const source = await readComponent("mention-autocomplete.tsx");
    // AC5: Enter/Tab must trigger insertion
    expect(source).toContain('"Enter"');
    expect(source).toContain('"Tab"');
    expect(source).toContain("insertSuggestion");
  });

  it("Escape closes the dropdown without inserting", async () => {
    const source = await readComponent("mention-autocomplete.tsx");
    // AC5: Escape dismisses the autocomplete
    expect(source).toContain('"Escape"');
    expect(source).toContain("setShowDropdown(false)");
  });

  it("dropdown listbox has role=listbox and items have role=option with aria-selected", async () => {
    const source = await readComponent("mention-autocomplete.tsx");
    // AC5: screen-reader accessible dropdown
    expect(source).toContain('role="listbox"');
    expect(source).toContain('role="option"');
    expect(source).toContain("aria-selected");
  });

  it("textarea declares aria-autocomplete='list' and aria-controls pointing to the listbox", async () => {
    const source = await readComponent("mention-autocomplete.tsx");
    // AC5: ARIA contract on the input
    expect(source).toContain('aria-autocomplete="list"');
    expect(source).toContain("aria-controls");
    expect(source).toContain("mention-listbox");
  });
});

// ---------------------------------------------------------------------------
// AC5: MentionAutocomplete never renders user-supplied HTML
// ---------------------------------------------------------------------------

describe("MentionAutocomplete source contracts — no user HTML rendering (AC5)", () => {
  it("does NOT use dangerouslySetInnerHTML for suggestion items", async () => {
    const source = await readComponent("mention-autocomplete.tsx");
    // AC5: suggestion display must be plain text, never raw HTML
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });

  it("renders username as plain text inside a span (not injected as HTML)", async () => {
    const source = await readComponent("mention-autocomplete.tsx");
    // AC5: username display via React text nodes, not innerHTML
    expect(source).toContain("@{item.username}");
    // Must NOT inject via innerHTML
    expect(source).not.toContain("innerHTML");
  });

  it("uses mousedown (not click) to prevent textarea blur on suggestion selection", async () => {
    const source = await readComponent("mention-autocomplete.tsx");
    // AC5: UX requirement — focus must stay in the textarea during suggestion pick
    expect(source).toContain("onMouseDown");
    expect(source).toContain("e.preventDefault()");
  });
});

// ---------------------------------------------------------------------------
// AC5: Suggest endpoint contract (suggestUsers in forums-client.ts)
// ---------------------------------------------------------------------------

describe("suggestUsers API client source contracts (AC5)", () => {
  it("suggestUsers encodes the query parameter safely", async () => {
    const source = await readAppFile("app/forums/forums-client.ts");
    const suggestBlock = source.slice(source.indexOf("export async function suggestUsers"));
    // AC5: query must be URL-encoded to prevent injection via the query string
    expect(suggestBlock).toContain("encodeURIComponent(q)");
  });

  it("suggestUsers result includes username, displayName, avatarUrl only (data minimization)", async () => {
    const source = await readAppFile("app/forums/forums-client.ts");
    // AC5: suggest results expose only the fields needed for display
    expect(source).toContain("UserSuggestItem");
    expect(source).toContain("username:");
    expect(source).toContain("displayName:");
    expect(source).toContain("avatarUrl:");
  });

  it("suggestUsers result does NOT include user email or internal IDs", async () => {
    const source = await readAppFile("app/forums/forums-client.ts");
    const suggestItemBlock = source.slice(
      source.indexOf("export interface UserSuggestItem"),
      source.indexOf("}", source.indexOf("export interface UserSuggestItem")) + 1
    );
    // AC5: data minimization — private fields must not be surfaced
    expect(suggestItemBlock).not.toContain("email:");
    expect(suggestItemBlock).not.toContain("id:");
    expect(suggestItemBlock).not.toContain("globalRole:");
    expect(suggestItemBlock).not.toContain("passwordHash");
  });
});

// ---------------------------------------------------------------------------
// AC5: @mention link rendering in topic/post author context
// ---------------------------------------------------------------------------

describe("@username link rendering in topic view source contracts (AC5)", () => {
  it("post author link uses /users/<encodeURIComponent(username)>", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/[topicSlug]/page.tsx");
    // AC5: rendered @username-style links use the correct /users/ prefix and encoding
    expect(source).toContain("/users/${encodeURIComponent(post.author.username)}");
  });

  it("topic author link uses /users/<encodeURIComponent(username)>", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/[topicSlug]/page.tsx");
    expect(source).toContain("/users/${encodeURIComponent(topic.author.username)}");
  });

  it("author links are rendered as Next.js Link components (not raw <a> tags)", async () => {
    const source = await readAppFile("app/forums/[boardSlug]/[topicSlug]/page.tsx");
    // AC5: Next.js Link is used for proper client-side routing
    expect(source).toContain('import Link from "next/link"');
    expect(source).toContain("authorLink");
  });
});
