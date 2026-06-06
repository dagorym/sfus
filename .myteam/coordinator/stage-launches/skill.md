---
name: "stage-launches"
description: "Create stage worktrees and launch downstream agents with the required wrapper instructions."
---

# Coordinator Stage Launches

Load this skill only when creating a stage worktree or launching a downstream agent.

## Tool

- Load skill `coordinator/worktree-tools` to access `create_worktree.py` when a new stage worktree must be created.
  Stage branches and worktrees follow the naming convention `<base>-<subtask>-<stage>-<date>`:
    - `<base>`: short plan-derived prefix — use the coordination base branch name when it is short, otherwise pick a short plan slug.
    - `<subtask>`: the subtask identifier from the plan (e.g. `subtask-1` or `st1`).
    - `<stage>`: the agent that will run in the worktree.
    - `<date>`: the date the subtask's Implementer was started (`YYYYMMDD`); later stages inherit it automatically.
  Per-stage invocations:
    - Implementer: compose the full branch name exactly once per subtask and invoke from the coordination base branch:
      `python create_worktree.py <TOP_LEVEL_DIR> <base>-<subtask>-implementer-<YYYYMMDD>`
    - Tester:      `python create_worktree.py <TOP_LEVEL_DIR> tester --from-branch <implementer-branch>`
    - Documenter:  `python create_worktree.py <TOP_LEVEL_DIR> documenter --from-branch <tester-branch>`
    - Verifier:    `python create_worktree.py <TOP_LEVEL_DIR> verifier --from-branch <documenter-branch>`
    For Tester, Documenter, and Verifier the script replaces the stage segment of the `--from-branch` name and preserves its date; do not compose those names manually.
  - If the plan specifies an explicit worktree location, use that as TOP_LEVEL_DIR.
  - Otherwise, default to `~/repos/worktrees` as TOP_LEVEL_DIR.
  - This keeps all stage worktrees isolated outside the repository root, avoiding git confusion and file-system nesting issues.
- Use the colocated `render_stage_prompt.py` to assemble every downstream stage prompt:
  Invoke it as: `python render_stage_prompt.py <PROMPT_PATH> --worktree-path <WORKTREE_PATH>`
  This prepends a working-directory instruction (so the agent starts in its assigned worktree) and the required workflow-continuation wrapper lines ahead of the substantive prompt body.

## Required Actions

- Create each stage worktree from the immediately preceding successful stage branch by passing `--from-branch <parent-stage-branch>` to `create_worktree.py`; the Implementer is the only stage that omits `--from-branch` (it always branches from the coordination base, with its full branch name composed by the Coordinator).
- Compose the full Implementer branch name (`<base>-<subtask>-implementer-<date>`) exactly once per subtask; never compose full branch names for Tester, Documenter, or Verifier — pass only the agent name and `--from-branch` so the stage segment and inherited date stay consistent.
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
