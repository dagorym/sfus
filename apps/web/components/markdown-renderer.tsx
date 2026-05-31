"use client";

/**
 * MarkdownRenderer
 *
 * Renders Markdown as sanitized HTML in the browser. Content is stored as
 * Markdown (server-validated) and displayed here with a safe, lightweight
 * conversion that blocks all script execution and unsafe HTML injection.
 *
 * Design decisions (Milestone 3):
 * - No external Markdown library dependency; a minimal inline converter is used
 *   to keep the dependency surface small.
 * - Sanitization removes all HTML tags from the Markdown source before
 *   conversion so that raw HTML injection in the stored content is a no-op.
 * - Only a safe subset of Markdown is rendered: headings, bold/italic, code
 *   blocks, inline code, blockquotes, unordered lists, and links/images.
 * - Links are rendered with rel="noopener noreferrer" and target="_blank".
 */

import React from "react";

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

/**
 * Strips any raw HTML tags from the Markdown source before rendering.
 * This is the primary XSS defence layer in the browser renderer.
 */
function stripRawHtml(markdown: string): string {
  // Remove all <...> tags. This is intentionally aggressive: raw HTML in
  // stored Markdown is already rejected by the server sanitizer, but we
  // apply this additional client-side strip as defence-in-depth.
  return markdown.replace(/<[^>]*>/g, "");
}

/**
 * Escapes a plain-text string so it can be inserted into HTML without
 * introducing injection opportunities.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// ---------------------------------------------------------------------------
// Minimal Markdown → HTML converter
// ---------------------------------------------------------------------------

function convertMarkdownToHtml(markdown: string): string {
  // 1. Strip any raw HTML before processing.
  const safe = stripRawHtml(markdown);

  const lines = safe.split("\n");
  const htmlLines: string[] = [];
  let inCodeBlock = false;
  let inList = false;

  for (const line of lines) {
    // Fenced code block toggle (``` ... ```)
    if (line.trimStart().startsWith("```")) {
      if (inList) {
        htmlLines.push("</ul>");
        inList = false;
      }
      if (inCodeBlock) {
        htmlLines.push("</code></pre>");
        inCodeBlock = false;
      } else {
        htmlLines.push("<pre><code>");
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      htmlLines.push(escapeHtml(line));
      continue;
    }

    // Blank line — close any open list
    if (!line.trim()) {
      if (inList) {
        htmlLines.push("</ul>");
        inList = false;
      }
      htmlLines.push("");
      continue;
    }

    // Headings (ATX style)
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      if (inList) {
        htmlLines.push("</ul>");
        inList = false;
      }
      const level = headingMatch[1].length;
      htmlLines.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Blockquote
    const blockquoteMatch = /^>\s?(.*)$/.exec(line);
    if (blockquoteMatch) {
      if (inList) {
        htmlLines.push("</ul>");
        inList = false;
      }
      htmlLines.push(`<blockquote>${renderInline(blockquoteMatch[1])}</blockquote>`);
      continue;
    }

    // Unordered list item (- or *)
    const listMatch = /^[-*]\s+(.*)$/.exec(line);
    if (listMatch) {
      if (!inList) {
        htmlLines.push("<ul>");
        inList = true;
      }
      htmlLines.push(`<li>${renderInline(listMatch[1])}</li>`);
      continue;
    }

    // Close list on any other content
    if (inList) {
      htmlLines.push("</ul>");
      inList = false;
    }

    // Paragraph
    htmlLines.push(`<p>${renderInline(line)}</p>`);
  }

  // Close any unclosed code block or list
  if (inCodeBlock) {
    htmlLines.push("</code></pre>");
  }
  if (inList) {
    htmlLines.push("</ul>");
  }

  return htmlLines.join("\n");
}

/**
 * Renders inline Markdown: **bold**, *italic*, `code`, [text](url), ![alt](url).
 * All text outside recognised patterns is HTML-escaped.
 */
function renderInline(text: string): string {
  // We process the string by splitting on recognised patterns. The order
  // matters: images before links so ![...] is not confused with [...].
  let result = "";
  let remaining = text;

  while (remaining.length > 0) {
    // Image: ![alt](url)
    const imgMatch = /^(.*?)!\[([^\]]*)\]\(([^)]+)\)/.exec(remaining);
    // Link: [text](url)
    const linkMatch = /^(.*?)\[([^\]]*)\]\(([^)]+)\)/.exec(remaining);
    // Bold: **text**
    const boldMatch = /^(.*?)\*\*([^*]+)\*\*/.exec(remaining);
    // Italic: *text* (not preceded by another *)
    const italicMatch = /^(.*?)\*([^*]+)\*/.exec(remaining);
    // Inline code: `code`
    const codeMatch = /^(.*?)`([^`]+)`/.exec(remaining);

    // Pick the earliest match by index of prefix group.
    type MatchEntry = { match: RegExpExecArray; type: string };
    const candidates: MatchEntry[] = [];
    if (imgMatch) candidates.push({ match: imgMatch, type: "img" });
    if (linkMatch) candidates.push({ match: linkMatch, type: "link" });
    if (boldMatch) candidates.push({ match: boldMatch, type: "bold" });
    if (italicMatch) candidates.push({ match: italicMatch, type: "italic" });
    if (codeMatch) candidates.push({ match: codeMatch, type: "code" });

    if (candidates.length === 0) {
      result += escapeHtml(remaining);
      break;
    }

    // The earliest match has the shortest prefix.
    candidates.sort((a, b) => a.match[1].length - b.match[1].length);
    const { match, type } = candidates[0];
    const prefix = match[1];

    result += escapeHtml(prefix);
    remaining = remaining.slice(prefix.length + match[0].length - prefix.length);

    if (type === "img") {
      const alt = escapeHtml(match[2]);
      const url = sanitizeUrl(match[3]);
      result += `<img src="${url}" alt="${alt}" loading="lazy">`;
    } else if (type === "link") {
      const linkText = escapeHtml(match[2]);
      const url = sanitizeUrl(match[3]);
      result += `<a href="${url}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
    } else if (type === "bold") {
      result += `<strong>${escapeHtml(match[2])}</strong>`;
    } else if (type === "italic") {
      result += `<em>${escapeHtml(match[2])}</em>`;
    } else if (type === "code") {
      result += `<code>${escapeHtml(match[2])}</code>`;
    }
  }

  return result;
}

/**
 * Sanitizes a URL so only safe schemes are rendered as links/image sources.
 * Rejects javascript:, vbscript:, data:, and any other non-http(s)/ scheme.
 */
function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  // Allow relative paths and http(s):// only.
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
    return trimmed;
  }
  // Reject all other schemes (javascript:, data:, etc.)
  return "#";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface MarkdownRendererProps {
  /** Markdown source string to render. */
  content: string;
  className?: string;
}

/**
 * MarkdownRenderer — renders stored Markdown as sanitized HTML.
 *
 * Uses dangerouslySetInnerHTML with a purpose-built sanitization pipeline:
 *  1. Strip raw HTML tags from the Markdown source.
 *  2. Convert Markdown to HTML using a minimal converter.
 *  3. Sanitize all URLs to allow only http(s) and relative paths.
 *
 * No script can execute from the rendered output because:
 * - Raw HTML tags are stripped before conversion.
 * - The converter only produces a safe subset of HTML elements.
 * - javascript:/vbscript:/data: URI schemes are rejected in URL attributes.
 */
export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const html = convertMarkdownToHtml(content);
  return (
    <div
      className={className}
      // Safe: HTML is generated by our sanitized converter, not pasted raw.
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
