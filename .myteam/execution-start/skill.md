---
name: "execution-start"
description: "Continue into substantive work in the same run when blocking inputs are present."
---

# Execution Start

Use this skill when a role's startup contract has been triggered and the agent should begin substantive work in the same run once required blocking inputs are present.

## Applies To

- execution-stage agents
- review-stage agents
- any agent that should continue after startup metadata instead of pausing unnecessarily

## Shared Rules

- Load this skill only after the agent has confirmed that its blocking startup inputs are present and its role allows immediate continuation.

- Do not stop after activation, role acknowledgment, or setup restatement when required blocking inputs are already present.
- Do not treat the startup restatement or announced next action as task completion.
- Treat completion of startup checks as a transition into substantive work, not as task completion.
- If required blocking inputs are present, continue into the first concrete work step in the same run.
- Do not end the response immediately after the startup restatement or next-action line when the next step can be performed now.
- The first substantive response should include:
  - a concise scope or task restatement
  - the next concrete action
  - evidence that the action has begun in the same run

## Limits

- Do not use this skill to bypass genuine approval gates.
- Do not use this skill when the role requires explicit user confirmation before edits or execution.
- Keep role-specific startup requirements inline in the agent definition.
