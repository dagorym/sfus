---
name: "approval-gated-editing"
description: "Require explicit user approval before writing edits in approval-gated workflows."
---

# Approval-Gated Editing

Use this skill when a role is entering an approval-gated proposal or write-decision step and must inspect, analyze, and propose changes before writing any edits.

## Shared Rules

- Load this skill at each approval gate that must be satisfied before writing, not as a blanket startup assumption.

- Do not write files before explicit user approval.
- Resolve open questions before presenting the final edit proposal when unresolved questions would change the proposal materially.
- Present the proposed changes clearly enough that the approval decision is informed.
- If user feedback changes scope, revise the proposal and ask for approval again before writing.

## Typical Proposal Content

- requested change restatement
- affected sections or files
- assumptions and open questions
- proposed diffs or edit plan

## Limits

- Keep role-specific proposal format requirements inline in the agent definition.
- Keep role-specific approval checkpoints inline when more than one approval gate exists.
- Do not use this skill for roles that are expected to execute immediately when blocking inputs are present.
