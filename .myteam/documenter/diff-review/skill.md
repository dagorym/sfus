---
name: "diff-review"
description: "Compare the actual implemented and tested diff against plan hints to determine documentation impact."
---

# Documenter Diff Review

Load this skill only when the documenter must determine what actually changed and what documentation impact follows from that diff.

## Required Actions

- Run `analyze_doc_impact.py` when the changed-file surface, comparison base, or likely documentation targets can be derived mechanically.
- Read the diff between the Tester branch and the relevant base branch or commit.
- Inspect both implementation and test changes to understand final shipped behavior.
- Use the plan's `Documentation Impact` section only as a discovery aid, not as the source of truth.
- Identify behavior already documented, documentation gaps, and any now-outdated statements.

## Limits

- Do not document planned behavior that is absent from the actual diff.
- Do not let the plan override the implemented and tested behavior.

## Tools

- `analyze_doc_impact.py` summarizes changed files, infers a likely comparison base when possible, flags guidance-file impact, and suggests candidate documentation targets so the model can focus on editorial judgment instead of diff bookkeeping.
