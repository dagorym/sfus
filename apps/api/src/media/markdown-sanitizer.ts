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
 */

/** Dangerous HTML patterns that are rejected from Markdown body submissions. */
const DANGEROUS_HTML_PATTERNS: RegExp[] = [
  /<script[\s\S]*?>/i,
  /<\/script>/i,
  /on\w+\s*=/i, // inline event handlers (onclick=, onerror=, etc.)
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
  /data\s*:/i
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
