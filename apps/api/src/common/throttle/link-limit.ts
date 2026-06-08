/**
 * link-limit.ts
 *
 * Reusable per-post URL-count limiter.
 *
 * Counts Markdown-syntax links ([text](url)) and bare URLs in a Markdown body.
 * Returns the count so callers can enforce their own configured cap.
 *
 * CommonJS-safe: no import.meta.
 */

/**
 * URL pattern that matches:
 *   - Markdown syntax links:   [text](url)  — captures the url part
 *   - Bare http/https URLs:    http://...    (outside Markdown link syntax)
 *
 * We use a two-pass approach:
 *   1. Count Markdown [text](url) occurrences.
 *   2. Count bare http/https URLs that are NOT preceded by ]( (i.e. not already
 *      counted in pass 1, to avoid double-counting).
 */

// Matches Markdown link destinations: ](...)
const MARKDOWN_LINK_RE = /\]\([^)]*\)/g;

// Matches bare http/https URLs that are NOT part of a Markdown link (not preceded by "(").
// We look for http/https:// NOT immediately preceded by "(" (the Markdown link opener).
const BARE_URL_RE = /(?<!\()(https?:\/\/[^\s)\]>]+)/gi;

/**
 * Count the number of URLs in a Markdown string.
 *
 * @param body  The Markdown body to inspect.
 * @returns     The total URL count (Markdown links + bare URLs).
 */
export function countLinks(body: string): number {
  const markdownLinks = (body.match(MARKDOWN_LINK_RE) ?? []).length;
  const bareUrls = (body.match(BARE_URL_RE) ?? []).length;
  return markdownLinks + bareUrls;
}

/**
 * Check whether a Markdown body exceeds the configured link cap.
 *
 * @param body    The Markdown body.
 * @param maxLinks The maximum allowed number of URLs.
 * @returns       `true` when the body violates the limit (too many links).
 */
export function exceedsLinkLimit(body: string, maxLinks: number): boolean {
  return countLinks(body) > maxLinks;
}
