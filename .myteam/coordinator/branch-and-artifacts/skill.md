---
name: "branch-and-artifacts"
description: "Establish the coordination base branch and the plan/subtask artifact layout."
---

# Coordinator Branch And Artifacts

Load this skill before creating any worktree or stage branch.

## Required Actions

- Never use `main` or `master` as the coordination base branch.
- If the current branch is neither `main` nor `master`, use it as the coordination base branch.
- Otherwise create and check out a dedicated coordination branch derived from the plan identifier.
- Resolve the top-level shared artifact directory, defaulting to repository-root-relative `artifacts/`.
- Create the plan-level directory at `artifacts/<plan-identifier>/`.
- Create each subtask artifact directory at `artifacts/<plan-identifier>/<subtask-identifier>/`.
- Keep reviewer artifacts at the plan-level directory, not inside subtask directories.
