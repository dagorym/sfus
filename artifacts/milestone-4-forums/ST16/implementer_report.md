# ST16 Implementer Report — Security Remediation Pass 2

## Status: SUCCESS

## Task

ST16 Security Remediation Pass 2 — Fix stored XSS in shared Markdown renderer
(`apps/web/components/markdown-renderer.tsx`).

## Root Cause and Fix

**Root cause:** `sanitizeUrl()` returned a URL without HTML-attribute encoding,
so a URL containing a double-quote (e.g. `/a" onpointerover=alert\`1\``)
could break out of `href="..."` or `src="..."` and inject a live event handler.

**Why `&quot;` encoding alone was insufficient:** `&quot;` in an HTML attribute
value is resolved back to `"` by the HTML parser, which terminates the
double-quoted attribute. So the event handler after the `"` still became a live
attribute. This was confirmed empirically by the new behavioral tests.

**Fix applied (rejection approach):** `sanitizeUrl()` now rejects any URL
containing attribute-breaking characters (`"`, `'`, `<`, `>`, `&`) and returns
`"#"` instead. Legitimate real-world URLs percent-encode these characters
(`%22`, `%27`, etc.), so valid URLs are unaffected.

## Changed Files

- `apps/web/components/markdown-renderer.tsx`
  - `sanitizeUrl()` rejects URLs with `"`, `'`, `<`, `>`, or `&` → returns `"#"`
  - `convertMarkdownToHtml` exported (`@internal`) for pure-function testing

- `apps/web/components/authoring-components.spec.ts`
  - Added 9 behavioral XSS security tests (describe block:
    "MarkdownRenderer XSS behavioural tests — attribute breakout (ST16 security)")
  - Updated 2 source-audit assertions referencing the old `return "#"` literal

- `apps/web/app/forums/forums.spec.ts`
  - Updated 2 source-audit assertions referencing the old `return "#"` literal

## Validation Results

```
vitest run --root apps/web (worktree-local)
  Test Files  10 passed (10)
       Tests  377 passed (377)
  0 failures

pnpm typecheck → 0 errors
pnpm lint → clean
```

All ST16 ACs remain covered. Blog spec (116 tests) and pages spec (85 tests)
continue to pass — no regression in the shared renderer.

## XSS Proof (Behavioral Tests)

The proven payload `[click](/a" onpointerover=alert\`1\`)` now renders as:
```html
<p><a href="#" target="_blank" rel="noopener noreferrer">click</a></p>
```
No `onpointerover=` appears. The URL was rejected to `"#"`.

Before the fix, the output was:
```html
<a href="/a" onpointerover=alert`1`" target="_blank" ...>
```
— a LIVE event handler.

The behavioral tests are non-vacuous: they FAIL against the old renderer
(which returned the trimmed URL unchanged when the scheme was allowed).

## Implementation Commit

`5560ecd` — fix(security): neutralize stored XSS in shared Markdown renderer (ST16)

## Artifact Directory

`artifacts/milestone-4-forums/ST16/`
Prior security-1-fail pass preserved under:
`artifacts/milestone-4-forums/ST16/history/security-1-fail/`
