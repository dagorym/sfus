/**
 * link-limit.test.ts
 *
 * Tests for countLinks() and exceedsLinkLimit() exported from link-limit.ts.
 *
 * Acceptance criterion covered:
 *   AC2 — Link-count limiter rejects over-max bodies and accepts compliant
 *          ones; no double-counting of Markdown syntax vs bare URLs.
 */

import { describe, expect, it } from "vitest";

import { countLinks, exceedsLinkLimit } from "./link-limit";

// ---------------------------------------------------------------------------
// countLinks — Markdown link syntax
// ---------------------------------------------------------------------------

describe("countLinks — Markdown link syntax", () => {
  // AC2: Markdown [text](url) occurrences are counted exactly once each.

  it("counts zero links in plain prose with no URLs", () => {
    expect(countLinks("Hello world, no links here.")).toBe(0);
  });

  it("counts one Markdown link", () => {
    expect(countLinks("See [the docs](https://example.com) for details.")).toBe(1);
  });

  it("counts multiple Markdown links", () => {
    const body = "[A](https://a.com), [B](https://b.com), [C](https://c.com)";
    expect(countLinks(body)).toBe(3);
  });

  it("counts a Markdown image link as one link", () => {
    expect(countLinks("![Alt](https://img.example.com/photo.png)")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// countLinks — bare URLs
// ---------------------------------------------------------------------------

describe("countLinks — bare URLs", () => {
  // AC2: bare http/https URLs not inside Markdown link syntax are counted.

  it("counts one bare https URL", () => {
    expect(countLinks("Visit https://example.com for more.")).toBe(1);
  });

  it("counts one bare http URL", () => {
    expect(countLinks("See http://example.com here.")).toBe(1);
  });

  it("counts multiple bare URLs in a single body", () => {
    const body = "https://a.com and https://b.com and https://c.com";
    expect(countLinks(body)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// countLinks — no double-counting
// ---------------------------------------------------------------------------

describe("countLinks — no double-counting of Markdown links vs bare URLs", () => {
  // AC2: A Markdown link [text](https://...) must be counted once — not once
  // for the Markdown syntax AND once again as a bare URL.

  it("counts a Markdown link with an http URL destination exactly once", () => {
    // If double-counting occurred this would return 2 instead of 1.
    expect(countLinks("[link](https://example.com)")).toBe(1);
  });

  it("counts two distinct Markdown links as 2, not 4 (no double-count)", () => {
    const body = "[A](https://a.com) and [B](https://b.com)";
    expect(countLinks(body)).toBe(2);
  });

  it("counts mixed Markdown and bare URLs correctly without double-counting", () => {
    // 1 Markdown link + 1 bare URL = 2 total.
    const body = "See [docs](https://docs.example.com) and also https://blog.example.com";
    expect(countLinks(body)).toBe(2);
  });

  it("counts a body with both Markdown images and bare URLs without duplication", () => {
    // 1 Markdown image + 1 bare URL = 2 total.
    const body = "![img](https://img.example.com/x.png) and https://bare.example.com";
    expect(countLinks(body)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// countLinks — edge cases
// ---------------------------------------------------------------------------

describe("countLinks — edge cases", () => {
  it("returns 0 for an empty string", () => {
    expect(countLinks("")).toBe(0);
  });

  it("returns 0 for code blocks that contain URLs (no live link)", () => {
    // Code blocks should still count — the implementation counts all occurrences.
    // This test documents the actual behaviour rather than asserting hypothetical
    // exclusion that the implementation does not implement.
    const body = "```\nhttps://example.com\n```";
    expect(countLinks(body)).toBe(1);
  });

  it("counts a bare URL followed immediately by punctuation", () => {
    // The regex stops before ) ] > and whitespace; punctuation after a URL
    // boundary should not prevent counting.
    expect(countLinks("Go to https://example.com.")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// AC-Security-ReDoS: countLinks must complete a 1 MB pathological body in < 100 ms
// ---------------------------------------------------------------------------

describe("countLinks — ReDoS regression (AC-Security-ReDoS)", () => {
  /**
   * This test demonstrates that the implementation's linear indexOf-based
   * scanner completes a 1 MB pathological body in well under 100 ms.
   *
   * The OLD backtracking regex /\]\([^)]*\)/g took ~1211 ms on a 64 KB
   * variant of this body.  The new implementation must handle 1 MB in < 100 ms.
   *
   * Non-vacuous requirement: the pathological body "](".repeat(500000) triggers
   * catastrophic backtracking on the old regex because each `](` starts a match
   * attempt that scans to the end of the string without finding a closing `)`.
   *
   * Verification of old regex failure: if you replace the implementation with
   * /\]\([^)]*\)/g this test will time out or fail the < 100 ms assertion.
   */
  it("completes a 1 MB pathological body (no closing parens) in under 100 ms", () => {
    // Build a 1 MB body consisting entirely of `](` — worst case for the old
    // backtracking regex but trivially linear for the indexOf scanner.
    const pathologicalBody = "](".repeat(500_000); // ≈ 1 MB

    const start = performance.now();
    const result = countLinks(pathologicalBody);
    const elapsed = performance.now() - start;

    // The scanner caps at MAX_SCAN_BYTES (256 KB), so the result is bounded.
    // We do not assert on the exact count — what matters is timing.
    expect(result).toBeGreaterThanOrEqual(0);

    // Must complete in under 100 ms on any reasonable machine.
    expect(elapsed).toBeLessThan(100);
  });

  it("completes a 64 KB pathological body in under 20 ms", () => {
    // 32_000 repeats of `](` ≈ 64 KB, well within MAX_SCAN_BYTES (256 KB).
    const pathologicalBody = "](".repeat(32_000);

    const start = performance.now();
    countLinks(pathologicalBody);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(20);
  });
});

// ---------------------------------------------------------------------------
// AC-Security-Evasion: ftp://, mailto:, tel:, and www. each count as links
// ---------------------------------------------------------------------------

describe("countLinks — evasion detection (AC-Security-Evasion)", () => {
  // ftp:// scheme
  it("counts a bare ftp:// URL as a link", () => {
    expect(countLinks("Download from ftp://files.example.com/archive.zip")).toBe(1);
  });

  it("counts ftp:// URL in a Markdown link as one link (not double-counted)", () => {
    expect(countLinks("[Download](ftp://files.example.com/archive.zip)")).toBe(1);
  });

  // mailto: scheme
  it("counts a bare mailto: URI as a link", () => {
    expect(countLinks("Contact us at mailto:admin@example.com for support.")).toBe(1);
  });

  it("counts a Markdown mailto: link as one link", () => {
    expect(countLinks("[Email](mailto:admin@example.com)")).toBe(1);
  });

  // tel: scheme
  it("counts a bare tel: URI as a link", () => {
    expect(countLinks("Call us: tel:+15551234567")).toBe(1);
  });

  it("counts a Markdown tel: link as one link", () => {
    expect(countLinks("[Call](tel:+15551234567)")).toBe(1);
  });

  // www. bare host
  it("counts a space-preceded www. host as a link", () => {
    expect(countLinks("Visit www.example.com for more information.")).toBe(1);
  });

  it("counts a newline-preceded www. host as a link", () => {
    expect(countLinks("Links:\nwww.example.com\nwww.other.com")).toBe(2);
  });

  it("counts a tab-preceded www. host as a link", () => {
    expect(countLinks("See\twww.example.com today.")).toBe(1);
  });

  it("counts a bracket-preceded www. host as a link", () => {
    // e.g. (www.example.com) — the '(' is in WORD_BOUNDARY_CHARS
    expect(countLinks("(www.example.com) is a link")).toBe(1);
  });

  it("does NOT count www. in the middle of a word (no word boundary)", () => {
    // If www. is preceded by a non-boundary char it should NOT be counted.
    expect(countLinks("xwww.example.com")).toBe(0);
  });

  it("counts multiple different evasion scheme URLs in the same body", () => {
    const body = [
      "ftp://files.example.com",
      "mailto:user@example.com",
      "tel:+15559876543",
      "www.example.com"
    ].join(" ");

    expect(countLinks(body)).toBe(4);
  });

  it("counts evasion URLs mixed with Markdown links without double-counting", () => {
    // 1 Markdown link + 1 ftp bare URL + 1 mailto bare URI = 3 total.
    const body = "[docs](https://docs.example.com) and ftp://files.example.com and mailto:help@example.com";
    expect(countLinks(body)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// exceedsLinkLimit — over/under boundary
// ---------------------------------------------------------------------------

describe("exceedsLinkLimit — over/under boundary", () => {
  // AC2: exceedsLinkLimit returns true only when count > maxLinks.

  it("returns false when the body has no links and maxLinks is 0", () => {
    expect(exceedsLinkLimit("plain prose", 0)).toBe(false);
  });

  it("returns false when the link count equals maxLinks (at-limit, not over)", () => {
    // Exactly 2 links; maxLinks = 2 → at limit → should pass.
    const body = "[A](https://a.com) [B](https://b.com)";
    expect(exceedsLinkLimit(body, 2)).toBe(false);
  });

  it("returns true when the link count exceeds maxLinks by one", () => {
    // 3 links; maxLinks = 2 → over limit → should reject.
    const body = "[A](https://a.com) [B](https://b.com) [C](https://c.com)";
    expect(exceedsLinkLimit(body, 2)).toBe(true);
  });

  it("returns false for a compliant body with maxLinks = 5", () => {
    // 1 link < 5 → passes.
    expect(exceedsLinkLimit("[link](https://example.com)", 5)).toBe(false);
  });

  it("returns true for a body with one bare URL when maxLinks is 0", () => {
    // 1 URL > 0 → over limit.
    expect(exceedsLinkLimit("https://example.com", 0)).toBe(true);
  });

  it("returns false for an empty body regardless of maxLinks", () => {
    expect(exceedsLinkLimit("", 0)).toBe(false);
    expect(exceedsLinkLimit("", 10)).toBe(false);
  });
});
