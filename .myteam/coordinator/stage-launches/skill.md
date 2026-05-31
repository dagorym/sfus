---
name: "stage-launches"
description: "Create stage worktrees and launch downstream agents with the required wrapper instructions."
---

# Coordinator Stage Launches

Load this skill only when creating a stage worktree or launching a downstream agent.

## Tool

- Load skill `coordinator/worktree-tools` to access `create_worktree.py` when a new stage worktree must be created.
  Invoke it as: `python create_worktree.py <TOP_LEVEL_DIR> <AGENT_NAME>`
  - If the plan specifies an explicit worktree location, use that as TOP_LEVEL_DIR.
  - Otherwise, default to `~/repos/worktrees` as TOP_LEVEL_DIR.
  - This keeps all stage worktrees isolated outside the repository root, avoiding git confusion and file-system nesting issues.

## Required Actions

- Create each stage worktree from the immediately preceding successful stage branch.
- Do not create the next stage worktree until the previous stage completed successfully, committed all required changes and artifacts, and left a clean branch.
- Launch every downstream workflow agent as an isolated sub-agent.
- Prepend these wrapper lines verbatim before substantive downstream instructions:
  - `You must complete the full agent workflow; do not stop after activation output.`
  - `Do not stop after activation metadata; continue through the entire agent workflow, artifact writing, and commit handling.`
- Use the exact planner-written Implementer prompt and the exact valid upstream handoff prompts as the substantive downstream instructions.
