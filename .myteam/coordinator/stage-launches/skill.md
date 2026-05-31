---
name: "stage-launches"
description: "Create stage worktrees and launch downstream agents with the required wrapper instructions."
---

# Coordinator Stage Launches

Load this skill only when creating a stage worktree or launching a downstream agent.

## Tool

- Load skill `coordinator/worktree-tools` to access `create_worktree.py` when a new stage worktree must be created.
  Invoke it as: `python create_worktree.py <TOP_LEVEL_DIR> <AGENT_NAME> [--from-branch <PARENT_BRANCH>]`
  - Pass `--from-branch <PARENT_BRANCH>` to specify the branch the new worktree is created from:
    - Implementer: omit `--from-branch` (defaults to the current coordination base branch)
    - Tester:      `--from-branch <implementer-branch>`
    - Documenter:  `--from-branch <tester-branch>`
    - Verifier:    `--from-branch <documenter-branch>`
  - If the plan specifies an explicit worktree location, use that as TOP_LEVEL_DIR.
  - Otherwise, default to `~/repos/worktrees` as TOP_LEVEL_DIR.
  - This keeps all stage worktrees isolated outside the repository root, avoiding git confusion and file-system nesting issues.
- Use the colocated `render_stage_prompt.py` to assemble every downstream stage prompt:
  Invoke it as: `python render_stage_prompt.py <PROMPT_PATH> --worktree-path <WORKTREE_PATH>`
  This prepends a working-directory instruction (so the agent starts in its assigned worktree) and the required workflow-continuation wrapper lines ahead of the substantive prompt body.

## Required Actions

- Create each stage worktree from the immediately preceding successful stage branch by passing `--from-branch <parent-stage-branch>` to `create_worktree.py`; the Implementer is the only stage that omits `--from-branch` (it always branches from the coordination base).
- Do not create the next stage worktree until the previous stage completed successfully, committed all required changes and artifacts, and left a clean branch.
- Launch every downstream workflow agent as an isolated sub-agent in a separate background-task or equivalent separate-session execution context when the runtime supports it.
- Treat keeping downstream conversation state out of the Coordinator's active context as a launch-quality requirement, not just a stylistic preference.
- Pass the `model` and `reasoning_effort` resolved by `model-selection` as explicit parameters to each downstream agent launch; do not treat resolved model settings as advisory metadata.
- Use `render_stage_prompt.py --worktree-path <worktree-path> <prompt-path>` to assemble each stage prompt; do not manually prepend wrapper lines or omit the worktree path.
- Use the exact planner-written Implementer prompt and the exact valid upstream handoff prompts as the substantive prompt body passed to `render_stage_prompt.py`.

## Claude Code — Agent Tool

When the coordinator is running as Claude Code and launching agents via the Agent tool:

- Pass the resolved model as the Agent tool's `model` parameter using the following mapping:
  - Config name contains `"sonnet"` (case-insensitive) → `"sonnet"`
  - Config name contains `"opus"` (case-insensitive) → `"opus"`
  - Config name contains `"haiku"` (case-insensitive) → `"haiku"`
  - Exact full model ID (e.g. `"claude-sonnet-4-6"`) → pass as-is.
  - Unrecognized name → omit `model` and record the unresolved entry in coordination state.
- The Agent tool does not accept a `reasoning_effort` parameter. Encode the resolved effort level as an additional wrapper line prepended to the downstream prompt: `"Reasoning effort for this task: <high|medium|low>."` using the resolved value.
- Do not omit the `model` parameter when a valid mapping exists; passing it is a launch requirement, not an optional enhancement.
