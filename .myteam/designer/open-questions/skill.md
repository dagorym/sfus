---
name: "open-questions"
description: "Resolve outstanding design decisions before the edit proposal is presented."
---

# Designer Open Questions

Load this skill only when impact analysis identifies unresolved decisions that would materially change the proposal.

## Tooling

- Load the `decision-tracking` shared skill and use its `decision_tracker.py` tool to track the current question list, resolved decisions, remaining queue, and decision-dependent notes when that bookkeeping would otherwise consume unnecessary context.

## Required Actions

- Present each open question one at a time.
- For each question:
  - present the viable options, each with explicit pros and cons
  - recommend the best option, grounded in information already gathered (document context, stated design constraints, known requirements), with explicit rationale for the recommendation
  - prompt the user for a decision or approval
- Continue until all open questions are resolved.
- Keep the decision tracker synchronized with resolved and remaining items when the tool is in use.
- Incorporate the resolved decisions into the upcoming proposal.

## Limits

- Do not enter the proposal step while any open questions remain unresolved.
- Do not defer or silently resolve security-relevant design questions — always surface them explicitly and resolve them before the proposal step.
