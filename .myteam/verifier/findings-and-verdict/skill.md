---
name: "findings-and-verdict"
description: "Classify findings, build the structured report, and issue PASS, CONDITIONAL PASS, or FAIL."
---

# Verifier Findings And Verdict

Load this skill only when producing structured findings or deciding the final verdict.

## Required Actions

- Report every finding with severity `BLOCKING`, `WARNING`, or `NOTE`.
- Reference specific files and line numbers for every finding.
- Explain why each issue matters and how it relates to correctness, security, conventions, test sufficiency, or documentation accuracy.

## Verdict Rules

- Return `PASS` when there are no blocking findings.
- Return `CONDITIONAL PASS` when blocking findings are minor and well-defined.
- Return `FAIL` when significant issues require re-implementation or major correction.
