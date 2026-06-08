---
name: "implementer-prompts"
description: "Generate Coordinator-ready Implementer prompts for each subtask."
---

# Planner Implementer Prompts

Load this skill only when composing per-subtask Implementer prompts.

## Tooling

- Use the colocated tool `implementer_prompt_render.py` when the subtask content is already decided and the remaining work is rendering the required prompt structure consistently.

## Required Content

Each Implementer prompt must:
- begin with `Your role is 'implementer'. Your task is as follows:`
- include allowed files
- state the task to implement
- include implementation-outcome acceptance criteria
- include relevant validation guidance
- include Tester test-file location guidance
- include repository-root-relative artifact guidance
- include the exact marker line `Security review: required` when the subtask requires specialist security review
- instruct the Implementer to continue past preflight when blockers are absent
- avoid asking the Implementer to choose among unresolved design or UX options
- include the explicit completion gate:
  - `Do not report success unless all required artifacts exist and all changes are committed.`

## Limits

- Keep the prompt usable as-is by the Coordinator without reinterpretation.
- Do not emit a prompt that requires a design clarification turn to become executable.
- Do not allow the rendering tool to invent missing allowed files, task content, acceptance criteria, validation guidance, or artifact guidance.
