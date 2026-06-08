# Documenter Report — ST16 Security Remediation Pass 2

## Status

PASS

## Task

ST16 — security-driven remediation pass 2 (web forums / shared Markdown renderer XSS fix)

## Branch

ms4-st16-documenter-20260608

## Documentation Commit

43f54dc0dc4e787e4df16c69a6b3b3b9ec923a74

## Scope Summary

Pass 2 introduced a targeted XSS fix to `apps/web/components/markdown-renderer.tsx`: the
`sanitizeUrl()` function now rejects any URL containing HTML-attribute-breaking characters
(`"`, `'`, `<`, `>`, `&`) by returning `"#"`, closing a stored XSS vector where a raw `"`
in a Markdown link or image destination broke out of the surrounding `href`/`src` attribute
and injected a live event handler. Nine behavioral XSS tests were added to
`apps/web/components/authoring-components.spec.ts`, and two existing source-contract
assertions in `apps/web/app/forums/forums.spec.ts` were updated to match the new code
structure.

Pass-1 ST16 web-surface documentation (forums.md web section, web-shell.md route map,
content-management.md forums section) was confirmed present and accurate on this branch;
no changes were required.

## Pass-1 Docs Confirmed (no changes needed)

- `docs/features/forums.md` — Web Surfaces (ST16) section: present and accurate.
- `docs/features/web-shell.md` — route map includes all four forum routes: present and accurate.
- `docs/guides/content-management.md` — Forums section with browsing/moderation how-to: present and accurate.

## Documentation Changed

- `docs/features/media.md` — added a note to the `MarkdownRenderer` entry in the "Web components"
  section documenting the pass-2 `sanitizeUrl` attribute-breakout hardening. The note accurately
  describes what was fixed (attribute-breaking-char rejection), the XSS vector it closes (raw `"`
  breaking out of `href`/`src`), and explicitly flags the known functional regression (the `&`-check
  rejects legitimate multi-parameter query-string URLs) as pending verifier adjudication.

## Known Issue Forwarded to Verifier

The `&`-rejection in `sanitizeUrl` is a functional regression: URLs containing `&` (i.e., all
multi-parameter query-string URLs such as `https://example.com/?a=1&b=2`) are currently rejected
to `"#"`. This is a correctness issue for the verifier to adjudicate — the documenter has NOT
modified the renderer or the docs to explain away this regression.

## Files Modified (this pass)

- `docs/features/media.md`

## Artifacts Written

- `artifacts/milestone-4-forums/ST16/documenter_report.md`
- `artifacts/milestone-4-forums/ST16/documenter_result.json`
- `artifacts/milestone-4-forums/ST16/verifier_prompt.txt`
