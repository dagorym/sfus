/**
 * MarkdownSanitizer
 *
 * Provides a lightweight server-side sanitization pass over Markdown body content.
 * The canonical representation is Markdown. This utility validates that stored body
 * content does not contain raw HTML that could introduce unsafe script or injection
 * vectors if the content is later rendered in a browser context.
 *
 * Design decision (Milestone 3):
 *   - Content is stored as plain Markdown only.
 *   - Sanitization strips or rejects inline raw HTML from user-supplied Markdown.
 *   - Rendering HTML from Markdown happens in the web layer with its own sanitization;
 *     this layer protects the storage contract and rejects obviously unsafe payloads
 *     before they reach the database.
 *
 * Pattern anchoring policy:
 *   - Event-handler attributes (`on\w+=`) are matched only when they appear inside an
 *     HTML tag context (i.e., following `<` with optional tag content), preventing
 *     false positives on prose such as "the onclick = handler pattern".
 *   - `data:` URIs are matched only when they appear in URL positions: HTML attribute
 *     values for href/src or Markdown link/image destinations (`](data:`), preventing
 *     false positives on prose such as "training data: source A".
 */

/**
 * Dangerous HTML patterns that are rejected from Markdown body submissions.
 *
 * Rejection classes:
 *   1. Script tags: `<script...>` and `</script>`.
 *   2. Event-handler attributes: `on<word>=` inside HTML tag context
 *      (e.g. `<img onerror=...>`, `<a onclick=...>`).
 *   3. Dangerous embedding elements: `<iframe>`, `<object>`, `<embed>`.
 *   4. Form interaction elements: `<form>`, `<input>`, `<button>`.
 *   5. Dangerous URI schemes in URL positions: `javascript:`, `vbscript:`.
 *   6. `data:` URIs in URL positions: href/src attribute values and Markdown
 *      link/image destinations (e.g. `<a href="data:...">`, `[x](data:...)`).
 */
const DANGEROUS_HTML_PATTERNS: RegExp[] = [
  /<script[\s\S]*?>/i,
  /<\/script>/i,
  /<[^>]*\bon\w+\s*=/i, // inline event handlers inside HTML tags (onclick=, onerror=, etc.)
  /<iframe[\s\S]*?>/i,
  /<\/iframe>/i,
  /<object[\s\S]*?>/i,
  /<\/object>/i,
  /<embed[\s\S]*?>/i,
  /<form[\s\S]*?>/i,
  /<\/form>/i,
  /<input[\s\S]*?>/i,
  /<button[\s\S]*?>/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /(?:(?:href|src)\s*=\s*['"]?|]\()data\s*:/i // data: URIs in href/src attributes or Markdown link/image destinations
];

export interface SanitizationResult {
  safe: boolean;
  /** Populated with the first matched pattern description when safe is false. */
  reason?: string;
}

/**
 * Validates that the Markdown body does not contain raw unsafe HTML or script
 * injection patterns. Returns a safe/unsafe decision without mutating the input.
 *
 * Patterns are anchored to HTML tag and URL contexts where possible so that
 * legitimate prose (e.g. "training data: source A", "the onclick = handler
 * pattern") is not incorrectly rejected. See DANGEROUS_HTML_PATTERNS for the
 * full set of rejection classes.
 *
 * Callers that store body content MUST call this before persisting any
 * user-supplied Markdown and reject the request when safe === false.
 */
export function validateMarkdownBody(body: string): SanitizationResult {
  for (const pattern of DANGEROUS_HTML_PATTERNS) {
    if (pattern.test(body)) {
      return { safe: false, reason: `Unsafe content matched pattern: ${pattern.source}` };
    }
  }
  return { safe: true };
}

/**
 * Strips leading/trailing whitespace and normalises line endings to LF.
 * Does NOT strip content; callers should call validateMarkdownBody first.
 */
export function normalizeMarkdownBody(body: string): string {
  return body.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}
