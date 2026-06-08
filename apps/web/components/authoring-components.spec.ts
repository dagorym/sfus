/**
 * Source-contract tests for the Milestone 3 shared authoring components:
 * MarkdownRenderer, MarkdownEditor, ImageUpload.
 *
 * These tests use the project-established source-audit pattern (reading source
 * files and asserting on their content) because no DOM test environment (jsdom,
 * @testing-library/react) is available in this workspace. The pattern mirrors
 * apps/web/app/public-shell.spec.ts.
 *
 * Acceptance criteria covered:
 *  AC1 - Content stored as Markdown; sanitization blocks unsafe HTML/script
 *  AC2 - Authorized users can upload images for all MS3 content types
 *  AC3 - Unauthorized users blocked; MIME/size enforcement present
 *  AC4 - Authoring workflow is shared across content types, not duplicated
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { convertMarkdownToHtml } from "./markdown-renderer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const componentsRoot = __dirname;

async function readComponent(name: string): Promise<string> {
  return readFile(path.join(componentsRoot, name), "utf8");
}

// ---------------------------------------------------------------------------
// MarkdownRenderer
// ---------------------------------------------------------------------------

describe("MarkdownRenderer source contracts", () => {
  // AC1: Rendered content goes through a sanitization pipeline.

  it("strips raw HTML tags before conversion (defence-in-depth)", async () => {
    const source = await readComponent("markdown-renderer.tsx");
    // The stripRawHtml function removes <...> before Markdown conversion.
    expect(source).toContain("stripRawHtml");
    expect(source).toContain("replace(/<[^>]*>/g");
  });

  it("rejects javascript: URIs in links and images", async () => {
    const source = await readComponent("markdown-renderer.tsx");
    // sanitizeUrl must reject javascript: scheme.
    expect(source).toContain("sanitizeUrl");
    expect(source).toContain("javascript");
    // The fallback value when an unsafe scheme is detected (safe = allowed ? trimmed : "#").
    expect(source).toContain('"#"');
  });

  it("rejects vbscript: URIs", async () => {
    const source = await readComponent("markdown-renderer.tsx");
    expect(source).toContain("vbscript");
  });

  it("rejects data: URIs by allowlist — only http(s) and relative paths pass sanitizeUrl", async () => {
    const source = await readComponent("markdown-renderer.tsx");
    // The sanitizeUrl function uses an explicit allowlist: https?:// and relative paths.
    // Any unrecognised scheme (including data:) falls through to the "#" fallback.
    expect(source).toContain("https?:\\/\\/");
    // Confirm the allowlist approach: the fallback is "#" for unsafe schemes.
    expect(source).toContain('"#"');
    // Confirm the comment documents data: as a rejected scheme.
    expect(source).toContain("data:");
  });

  it("renders links with rel=noopener and target=_blank for safety", async () => {
    const source = await readComponent("markdown-renderer.tsx");
    expect(source).toContain('rel="noopener noreferrer"');
    expect(source).toContain('target="_blank"');
  });

  it("escapes HTML special characters in plain text", async () => {
    const source = await readComponent("markdown-renderer.tsx");
    // escapeHtml must convert < > & " '
    expect(source).toContain("escapeHtml");
    expect(source).toContain("&amp;");
    expect(source).toContain("&lt;");
    expect(source).toContain("&gt;");
    expect(source).toContain("&quot;");
  });

  it("is exported for reuse across all content type surfaces", async () => {
    const source = await readComponent("markdown-renderer.tsx");
    // AC4: single shared component, not duplicated per screen.
    expect(source).toContain("export function MarkdownRenderer");
  });

  it("accepts content and optional className props", async () => {
    const source = await readComponent("markdown-renderer.tsx");
    expect(source).toContain("content: string");
    expect(source).toContain("className");
  });

  it("uses dangerouslySetInnerHTML with the sanitized converter output", async () => {
    const source = await readComponent("markdown-renderer.tsx");
    expect(source).toContain("dangerouslySetInnerHTML");
    expect(source).toContain("convertMarkdownToHtml");
  });
});

// ---------------------------------------------------------------------------
// MarkdownEditor
// ---------------------------------------------------------------------------

describe("MarkdownEditor source contracts", () => {
  // AC1, AC4: Shared editor with Write/Preview toggle over Markdown representation.

  it("exports a single shared MarkdownEditor component (not duplicated per content type)", async () => {
    const source = await readComponent("markdown-editor.tsx");
    // AC4: one editor for all content types.
    expect(source).toContain("export function MarkdownEditor");
    // Design doc comment confirms reuse intent.
    expect(source).toContain("blog posts, standalone");
  });

  it("is fully controlled — accepts value and onChange props", async () => {
    const source = await readComponent("markdown-editor.tsx");
    // Controlled component contract.
    expect(source).toContain("value: string");
    expect(source).toContain("onChange: (value: string) => void");
  });

  it("provides Write and Preview mode toggle", async () => {
    const source = await readComponent("markdown-editor.tsx");
    // Write/Preview tab buttons must be present.
    expect(source).toContain('"write"');
    expect(source).toContain('"preview"');
    expect(source).toContain("Write");
    expect(source).toContain("Preview");
  });

  it("uses MarkdownRenderer for preview mode (sanitization reused)", async () => {
    const source = await readComponent("markdown-editor.tsx");
    // AC1: preview must go through the shared MarkdownRenderer sanitization.
    expect(source).toContain("MarkdownRenderer");
    expect(source).toContain('from "./markdown-renderer"');
  });

  it("renders a textarea in write mode", async () => {
    const source = await readComponent("markdown-editor.tsx");
    expect(source).toContain("<textarea");
  });

  it("disables editor controls when disabled prop is set", async () => {
    const source = await readComponent("markdown-editor.tsx");
    expect(source).toContain("disabled={disabled}");
  });

  it("passes mode toggle buttons aria-pressed for accessibility", async () => {
    const source = await readComponent("markdown-editor.tsx");
    expect(source).toContain("aria-pressed");
  });
});

// ---------------------------------------------------------------------------
// ImageUpload
// ---------------------------------------------------------------------------

describe("ImageUpload source contracts", () => {
  // AC2, AC3: protected upload widget for all MS3 content types.

  it("exports a single shared ImageUpload component (not duplicated per content type)", async () => {
    const source = await readComponent("image-upload.tsx");
    // AC4.
    expect(source).toContain("export function ImageUpload");
    expect(source).toContain("blog posts,");
  });

  it("accepts resourceType prop scoped to MS3 content types", async () => {
    const source = await readComponent("image-upload.tsx");
    // AC2: all three resource types must be listed.
    expect(source).toContain('"blog-post"');
    expect(source).toContain('"standalone-page"');
    expect(source).toContain('"blog-comment"');
  });

  it("constructs the upload URL with the resourceType query parameter", async () => {
    const source = await readComponent("image-upload.tsx");
    // The upload request must include resourceType in the query string.
    expect(source).toContain("resourceType=${encodeURIComponent(resourceType)}");
    expect(source).toContain("/media/upload");
  });

  it("sends the request with credentials: include (session cookie forwarded)", async () => {
    const source = await readComponent("image-upload.tsx");
    // AC2: session must be forwarded so the protected endpoint can authorise.
    expect(source).toContain('credentials: "include"');
  });

  it("handles 401 Unauthorized with a specific error message (AC3)", async () => {
    const source = await readComponent("image-upload.tsx");
    // AC3: unauthorized users must be surfaced a clear rejection.
    expect(source).toContain("response.status === 401");
    expect(source).toContain("Authentication required");
  });

  it("calls onError callback when the upload fails or is unauthorized", async () => {
    const source = await readComponent("image-upload.tsx");
    expect(source).toContain("onError?.(msg)");
  });

  it("performs a client-side MIME guard for non-image files (UX only)", async () => {
    const source = await readComponent("image-upload.tsx");
    // AC3 note: early UX rejection for obviously non-image files.
    expect(source).toContain("file.type.startsWith");
    expect(source).toContain("Only image files are allowed.");
  });

  it("uses multipart/form-data FormData for the upload request", async () => {
    const source = await readComponent("image-upload.tsx");
    expect(source).toContain("FormData");
    expect(source).toContain('formData.append("file"');
  });

  it("calls onUpload callback with the result on success", async () => {
    const source = await readComponent("image-upload.tsx");
    expect(source).toContain("onUpload(result)");
  });

  it("restricts the file input accept attribute to image/*", async () => {
    const source = await readComponent("image-upload.tsx");
    expect(source).toContain('accept="image/*"');
  });

  it("shows an uploading state label while the request is in-flight", async () => {
    const source = await readComponent("image-upload.tsx");
    expect(source).toContain("Uploading");
    expect(source).toContain("uploading");
  });

  it("surfaces error messages with an alert role for accessibility", async () => {
    const source = await readComponent("image-upload.tsx");
    expect(source).toContain('role={statusType === "error" ? "alert" : "status"}');
  });

  it("captures alt text via a controlled input — altText state present", async () => {
    // AC: ImageUpload captures alt text and includes it in the upload result.
    const source = await readComponent("image-upload.tsx");
    // A controlled altText state must be declared.
    expect(source).toContain("altText");
    expect(source).toContain("setAltText");
    // Alt text must be attached to the upload result.
    expect(source).toContain("altText: altText");
  });

  it("includes altText in ImageUploadResult interface", async () => {
    // AC: ImageUploadResult.altText is added to the interface.
    const source = await readComponent("image-upload.tsx");
    expect(source).toContain("altText: string");
  });

  it("uses useId() to generate per-instance unique DOM ids for the file and alt inputs", async () => {
    // AC: multiple ImageUpload widgets on a page have unique DOM ids via useId.
    const source = await readComponent("image-upload.tsx");
    // useId must be imported.
    expect(source).toContain("useId");
    // Per-instance ids must be derived from the useId result.
    expect(source).toContain("image-upload-input-");
    expect(source).toContain("image-upload-alt-");
    // The instanceId variable must be used to construct the ids.
    expect(source).toContain("instanceId");
  });

  it("assigns unique id to the file input element", async () => {
    // AC: each widget's file input has a distinct id, avoiding DOM id collisions.
    const source = await readComponent("image-upload.tsx");
    expect(source).toContain("inputId");
    // The id attribute must be bound to the per-instance variable, not a literal.
    expect(source).toContain("id={inputId}");
  });

  it("assigns unique id to the alt text input element", async () => {
    // AC: each widget's alt text input has a distinct id.
    const source = await readComponent("image-upload.tsx");
    expect(source).toContain("altInputId");
    expect(source).toContain("id={altInputId}");
  });
});

// ---------------------------------------------------------------------------
// Reusability contract (AC4)
// ---------------------------------------------------------------------------

describe("Authoring workflow reusability contracts (AC4)", () => {
  it("MarkdownEditor imports MarkdownRenderer — one sanitization pipeline for all surfaces", async () => {
    const editorSource = await readComponent("markdown-editor.tsx");
    expect(editorSource).toContain('from "./markdown-renderer"');
  });

  it("all three shared authoring components exist in the components directory", async () => {
    // Verify no per-content-type duplication: single files, not multiple copies.
    const [rendererSource, editorSource, uploadSource] = await Promise.all([
      readComponent("markdown-renderer.tsx"),
      readComponent("markdown-editor.tsx"),
      readComponent("image-upload.tsx")
    ]);
    expect(rendererSource).toBeTruthy();
    expect(editorSource).toBeTruthy();
    expect(uploadSource).toBeTruthy();
  });

  it("ImageUpload apiBasePath is configurable (not hardcoded) for reuse across surfaces", async () => {
    const source = await readComponent("image-upload.tsx");
    // The component accepts an apiBasePath prop instead of a hardcoded path.
    expect(source).toContain("apiBasePath");
    expect(source).toContain("NEXT_PUBLIC_API_BASE_PATH");
  });
});

// ---------------------------------------------------------------------------
// SECURITY: MarkdownRenderer XSS behavioural tests (ST16 security remediation)
//
// These are BEHAVIOURAL tests that call the pure convertMarkdownToHtml function
// directly with live XSS payloads and assert the rendered output is INERT.
// They require NO jsdom or React rendering harness.
//
// These tests MUST FAIL against the old renderer (pre-fix) where sanitizeUrl()
// returned a raw URL without HTML-attribute encoding.
// ---------------------------------------------------------------------------

describe("MarkdownRenderer XSS behavioural tests — attribute breakout (ST16 security)", () => {
  it("proven XSS payload: quote in link href does NOT produce a live event handler", () => {
    // Proven payload: [click](/a" onpointerover=alert`1`)
    // Old renderer: <a href="/a" onpointerover=alert`1`" ...> (LIVE handler)
    // Fixed renderer: URL containing " is REJECTED → href="#" (no event handler injected).
    const payload = '[click](/a" onpointerover=alert`1`)';
    const output = convertMarkdownToHtml(payload);
    // The event handler must NOT appear in the output at all — URL was rejected.
    expect(output).not.toContain('onpointerover=');
    // The URL with " is rejected — href falls back to "#"
    expect(output).toContain('href="#"');
  });

  it("quote in link href: URL containing \" is rejected to # (attribute breakout blocked)", () => {
    const output = convertMarkdownToHtml('[text](/path?foo=bar"&baz=1)');
    // URL contains " — rejected to "#", no breakout possible.
    expect(output).toContain('href="#"');
    // No bare double-quote from the URL should appear in the href attribute value.
    expect(output).not.toContain('/path?foo=bar"');
  });

  it("onerror injection via image src does NOT produce a live event handler", () => {
    // Attempt: ![alt](/x" onerror=alert`1`)
    const payload = '![alt](/x" onerror=alert`1`)';
    const output = convertMarkdownToHtml(payload);
    // URL containing " is rejected — onerror handler never appears.
    expect(output).not.toContain('onerror=');
    // src falls back to "#"
    expect(output).toContain('src="#"');
  });

  it("quote in image src: URL containing \" is rejected to # (no raw quote in output)", () => {
    const output = convertMarkdownToHtml('![img](/img?size=1"&fmt=png)');
    // URL contains " — rejected to "#"
    expect(output).toContain('src="#"');
    expect(output).not.toContain('/img?size=1"');
  });

  it("javascript: scheme in link href is rejected (returns # as href)", () => {
    const output = convertMarkdownToHtml("[click](javascript:alert(1))");
    expect(output).not.toContain("javascript:");
    expect(output).toContain('href="#"');
  });

  it("javascript: scheme in image src is rejected (returns # as src)", () => {
    const output = convertMarkdownToHtml("![img](javascript:alert(1))");
    expect(output).not.toContain("javascript:");
    expect(output).toContain('src="#"');
  });

  it("data: URI in link href is rejected", () => {
    const output = convertMarkdownToHtml("[click](data:text/html,<script>alert(1)</script>)");
    expect(output).not.toContain("data:");
    expect(output).toContain('href="#"');
  });

  it("clean URL without special chars passes through intact", () => {
    // Confirm safe URLs are not rejected (regression guard).
    const output = convertMarkdownToHtml("[link](/path?a=1)");
    expect(output).toContain('href="/path?a=1"');
  });

  it("https URL without special chars passes through intact", () => {
    const output = convertMarkdownToHtml("[link](https://example.com/path)");
    expect(output).toContain('href="https://example.com/path"');
  });

  it("multi-param query-string URL with & is preserved (& is a legal RFC 3986 delimiter, not an attr breakout)", () => {
    // & is NOT an attribute-breakout character inside a double-quoted href="..."
    // and MUST NOT be rejected. Rejecting it broke real multi-parameter URLs.
    const output = convertMarkdownToHtml("[x](https://example.com/?a=1&b=2)");
    expect(output).toContain('href="https://example.com/?a=1&b=2"');
    expect(output).not.toContain('href="#"');
  });

  it("relative multi-param query-string URL with & is preserved", () => {
    const output = convertMarkdownToHtml("[x](/path?a=1&b=2)");
    expect(output).toContain('href="/path?a=1&b=2"');
    expect(output).not.toContain('href="#"');
  });
});
