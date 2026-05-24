---
name: "documentation-proposal"
description: "Propose repo-level documentation follow-up after `.myteam` node updates."
---

# Agent Builder Documentation Proposal

Load this skill only after `.myteam` node actions are complete and repo-level documentation or instruction files may need follow-up.

## Required Actions

- Run `doc_impact_scan.py` to identify likely repo-level documentation or instruction files that reference the changed node or may need follow-up.
- Present minimal documentation diffs inline in chat when relevant.
- Ask for explicit approval before writing documentation updates.
- Treat scan results as candidates to confirm, not automatic proof that documentation must change.

## Limits

- Do not write repository documentation updates without explicit approval.
