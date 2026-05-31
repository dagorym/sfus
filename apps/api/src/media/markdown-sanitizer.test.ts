import { describe, expect, it } from "vitest";

import { normalizeMarkdownBody, validateMarkdownBody } from "./markdown-sanitizer";

describe("validateMarkdownBody", () => {
  // Acceptance criterion: validateMarkdownBody rejects Markdown containing
  // unsafe HTML or script injection patterns.

  describe("safe Markdown", () => {
    it("allows plain prose text", () => {
      const result = validateMarkdownBody("Hello, world! This is a blog post.");
      expect(result.safe).toBe(true);
    });

    it("allows standard Markdown headings and formatting", () => {
      const result = validateMarkdownBody(
        "# Title\n\n**Bold** and _italic_ text.\n\n- List item\n- Another item"
      );
      expect(result.safe).toBe(true);
    });

    it("allows Markdown links", () => {
      const result = validateMarkdownBody("[Visit us](https://example.com)");
      expect(result.safe).toBe(true);
    });

    it("allows Markdown images", () => {
      const result = validateMarkdownBody("![Alt text](/api/media/some-id)");
      expect(result.safe).toBe(true);
    });

    it("allows code blocks without HTML injection", () => {
      const result = validateMarkdownBody("```\nconst x = 1;\n```");
      expect(result.safe).toBe(true);
    });

    it("allows inline code spans", () => {
      const result = validateMarkdownBody("Use `const` instead of `var`.");
      expect(result.safe).toBe(true);
    });

    it("allows blockquotes", () => {
      const result = validateMarkdownBody("> This is a blockquote\n> spanning lines.");
      expect(result.safe).toBe(true);
    });
  });

  describe("unsafe content — script injection", () => {
    it("rejects a bare <script> tag", () => {
      const result = validateMarkdownBody("<script>alert('xss')</script>");
      expect(result.safe).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it("rejects a self-closing <script> tag", () => {
      const result = validateMarkdownBody("<script src='evil.js'>");
      expect(result.safe).toBe(false);
    });

    it("rejects </script> close tag", () => {
      const result = validateMarkdownBody("some text</script>more text");
      expect(result.safe).toBe(false);
    });
  });

  describe("unsafe content — event handler attributes", () => {
    it("rejects onclick= attribute", () => {
      const result = validateMarkdownBody('<a href="#" onclick="steal()">click</a>');
      expect(result.safe).toBe(false);
    });

    it("rejects onerror= attribute", () => {
      const result = validateMarkdownBody('<img src="x" onerror="alert(1)">');
      expect(result.safe).toBe(false);
    });

    it("rejects onload= attribute", () => {
      const result = validateMarkdownBody("<body onload=evil()>");
      expect(result.safe).toBe(false);
    });

    it("rejects generic on-prefixed handler", () => {
      const result = validateMarkdownBody("onmouseover= something");
      expect(result.safe).toBe(false);
    });
  });

  describe("unsafe content — dangerous HTML elements", () => {
    it("rejects <iframe>", () => {
      const result = validateMarkdownBody("<iframe src='https://evil.com'></iframe>");
      expect(result.safe).toBe(false);
    });

    it("rejects <object>", () => {
      const result = validateMarkdownBody("<object data='evil.swf'></object>");
      expect(result.safe).toBe(false);
    });

    it("rejects <embed>", () => {
      const result = validateMarkdownBody("<embed src='evil.swf'>");
      expect(result.safe).toBe(false);
    });

    it("rejects <form>", () => {
      const result = validateMarkdownBody("<form action='https://evil.com'></form>");
      expect(result.safe).toBe(false);
    });

    it("rejects <input>", () => {
      const result = validateMarkdownBody("<input type='hidden' value='stolen'>");
      expect(result.safe).toBe(false);
    });

    it("rejects <button>", () => {
      const result = validateMarkdownBody("<button onclick='evil()'>Click</button>");
      expect(result.safe).toBe(false);
    });
  });

  describe("unsafe content — dangerous URI schemes", () => {
    it("rejects javascript: URI in a link", () => {
      const result = validateMarkdownBody("[bad](javascript:alert(1))");
      expect(result.safe).toBe(false);
    });

    it("rejects vbscript: URI", () => {
      const result = validateMarkdownBody("[bad](vbscript:evil())");
      expect(result.safe).toBe(false);
    });

    it("rejects data: URI", () => {
      const result = validateMarkdownBody("![img](data:image/svg+xml;base64,PHN2...)");
      expect(result.safe).toBe(false);
    });
  });
});

describe("normalizeMarkdownBody", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeMarkdownBody("  hello  ")).toBe("hello");
  });

  it("converts CRLF to LF", () => {
    expect(normalizeMarkdownBody("line1\r\nline2")).toBe("line1\nline2");
  });

  it("converts lone CR to LF", () => {
    expect(normalizeMarkdownBody("line1\rline2")).toBe("line1\nline2");
  });

  it("preserves internal LF newlines", () => {
    expect(normalizeMarkdownBody("line1\nline2\nline3")).toBe("line1\nline2\nline3");
  });
});
