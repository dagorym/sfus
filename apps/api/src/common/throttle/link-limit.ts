/**
 * link-limit.ts
 *
 * Reusable per-post URL-count limiter.
 *
 * Counts links in a Markdown body and returns the count so callers can
 * enforce their own configured cap.  Two categories are counted:
 *
 *   1. Markdown-syntax links  [text](destination) — the ]( … ) form.
 *   2. Bare URLs / hosts outside Markdown link syntax:
 *        - http:// and https:// (bare scheme URLs)
 *        - ftp://, mailto:, tel: (common evasion schemes)
 *        - www.-prefixed hosts  (scheme-less, e.g. www.example.com)
 *
 * SECURITY: all scanning is linear-time (indexOf-based).  No regex with
 * unbounded repetition is used on attacker-controlled input.  A hard cap
 * (MAX_SCAN_BYTES) bounds the worst-case work regardless of body size.
 *
 * CommonJS-safe: no import.meta.
 */

/** Hard cap: only inspect the first N bytes of the body (256 KB). */
const MAX_SCAN_BYTES = 262144; // 256 KB

/** URL schemes counted when appearing outside a Markdown link destination. */
const BARE_SCHEMES: readonly string[] = [
  "https://",
  "http://",
  "ftp://",
  "mailto:",
  "tel:",
];

/** www.-prefixed bare host prefix counted as a link. */
const WWW_PREFIX = "www.";

/** Characters that may precede a www. host for it to be considered bare. */
const WORD_BOUNDARY_CHARS = new Set(["", " ", "\t", "\n", "\r", ">", "(", "["]);

/**
 * Scan for Markdown-syntax links  ](…)  in O(n) time using indexOf.
 *
 * Returns:
 *   - `count`         — number of Markdown links found.
 *   - `skipPositions` — set of body positions where a scheme-prefixed URL
 *                        starts *inside* a Markdown link destination.  These
 *                        positions are excluded from the bare-URL pass to
 *                        prevent double-counting.
 */
function scanMarkdownLinks(
  body: string,
): { count: number; skipPositions: Set<number> } {
  let count = 0;
  let pos = 0;
  const skipPositions = new Set<number>();

  while (pos < body.length) {
    // Find the next '](' opener.
    const openIdx = body.indexOf("](", pos);
    if (openIdx === -1) break;

    const destStart = openIdx + 2; // position right after '('

    // Find the matching ')'.  Standard Markdown does not nest parens in
    // destinations — we take the first ')'.
    const destEnd = body.indexOf(")", destStart);
    if (destEnd === -1) {
      // No closing paren remains in the body.
      break;
    }

    count++;

    // Record the start of the destination if it begins with a scheme we
    // would also count in the bare-URL pass.
    const dest = body.slice(destStart, destEnd);
    for (const scheme of BARE_SCHEMES) {
      if (dest.startsWith(scheme)) {
        skipPositions.add(destStart);
        break;
      }
    }

    // Advance past this link.  The next link can only start at or after
    // destEnd + 1.
    pos = destEnd + 1;
  }

  return { count, skipPositions };
}

/**
 * Count bare scheme-prefixed URLs and www.-prefixed hosts in O(n) time.
 *
 * Positions already counted as Markdown link destinations (skipPositions)
 * are excluded so Markdown links are never double-counted.
 */
function scanBareUrls(body: string, skipPositions: Set<number>): number {
  let count = 0;
  // Track positions already counted to avoid counting the same token twice
  // (e.g. if two different scheme searches would match overlapping text).
  const counted = new Set<number>();

  // --- Scheme-prefixed URLs ---
  for (const scheme of BARE_SCHEMES) {
    let pos = 0;
    while (pos < body.length) {
      const idx = body.indexOf(scheme, pos);
      if (idx === -1) break;

      // Skip if this URL is the destination of a Markdown link already counted.
      if (!skipPositions.has(idx) && !counted.has(idx)) {
        const charBefore = idx > 0 ? body[idx - 1] : "";
        // Only count when the scheme appears at a word boundary (preceded by
        // whitespace, an opening bracket, or the start of the string).  This
        // mirrors the www. branch and prevents embedded scheme substrings
        // (e.g. "hotel:", "motel:", an inlined "mailto:") from being
        // counted.  The '(' exclusion keeps the existing markdown-link-
        // destination guard: a URL inside ](...) is skipped via skipPositions,
        // and any residual '(' prefix is rejected here as well.
        if (WORD_BOUNDARY_CHARS.has(charBefore) && charBefore !== "(") {
          count++;
          counted.add(idx);
        }
      }

      pos = idx + scheme.length;
    }
  }

  // --- www.-prefixed bare hosts ---
  {
    let pos = 0;
    while (pos < body.length) {
      const idx = body.indexOf(WWW_PREFIX, pos);
      if (idx === -1) break;

      if (!skipPositions.has(idx) && !counted.has(idx)) {
        // Only count when www. appears at a word boundary (preceded by
        // whitespace, an opening bracket/paren, or the start of the string).
        const charBefore = idx > 0 ? body[idx - 1] : "";
        if (WORD_BOUNDARY_CHARS.has(charBefore)) {
          count++;
          counted.add(idx);
        }
      }

      pos = idx + WWW_PREFIX.length;
    }
  }

  return count;
}

/**
 * Count the number of links in a Markdown string.
 *
 * Detects:
 *   - Markdown-syntax links  [text](destination)
 *   - Bare http:// / https:// / ftp:// / mailto: / tel: URLs
 *   - Bare www.-prefixed hosts
 *
 * Runs in O(min(n, MAX_SCAN_BYTES)) time — no catastrophic backtracking.
 *
 * @param body  The Markdown body to inspect.
 * @returns     The total link count.
 */
export function countLinks(body: string): number {
  // Cap the inspected region to bound worst-case work.
  const scanned =
    body.length > MAX_SCAN_BYTES ? body.slice(0, MAX_SCAN_BYTES) : body;

  const { count: mdCount, skipPositions } = scanMarkdownLinks(scanned);
  const bareCount = scanBareUrls(scanned, skipPositions);
  return mdCount + bareCount;
}

/**
 * Check whether a Markdown body exceeds the configured link cap.
 *
 * @param body      The Markdown body.
 * @param maxLinks  The maximum allowed number of links.
 * @returns         `true` when the body violates the limit (too many links).
 */
export function exceedsLinkLimit(body: string, maxLinks: number): boolean {
  return countLinks(body) > maxLinks;
}
