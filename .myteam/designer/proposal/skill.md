---
name: "proposal"
description: "Present the section-by-section change plan and approval-gated inline diffs."
---

# Designer Proposal

Load this skill only when all open questions are resolved and the proposed design-document changes are ready to present.

## Tooling

- Use the colocated tool `extract_section_context.py` to gather the current text of targeted sections and surrounding heading context before drafting inline diffs.

## Required Actions

- Present a section-by-section change plan.
- Show exact patch-style diffs inline in chat for all intended edits.
- Explain the impacts and trade-offs clearly.
- Request explicit approval before any file edits are made.

## Limits

- If feedback changes scope, revise the proposal and ask for approval again.
- Do not write files before explicit approval.
- Do not re-copy large unchanged document regions into the proposal when the colocated tool can isolate the relevant section context.
