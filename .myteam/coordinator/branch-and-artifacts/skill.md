---
name: "branch-and-artifacts"
description: "Establish the coordination base branch and the plan/subtask artifact layout."
---

# Coordinator Branch And Artifacts

Load this skill before creating any worktree or stage branch.

## Required Actions

- Never use `main` or `master` as the coordination base branch.
- If the current branch is neither `main` nor `master`, use it as the coordination base branch.
- Otherwise create and check out a dedicated short coordination branch derived from the plan identifier, with no date suffix — the branch is ephemeral (merged to main and deleted when coordination ends), and its name typically becomes the `<base>` prefix of every stage branch, so keep it short.
- Resolve the top-level shared artifact directory, defaulting to repository-root-relative `artifacts/`.
- Create the plan-level directory at `artifacts/<plan-identifier>/`.
- Create each subtask artifact directory at `artifacts/<plan-identifier>/<subtask-identifier>/`.
- Treat each subtask artifact directory root as the canonical live artifact location for the latest completed pass only.
- Create a per-subtask history directory at `artifacts/<plan-identifier>/<subtask-identifier>/history/`.
- Preserve superseded pass artifacts only under the subtask history directory, never as the live root artifacts.
- Keep reviewer artifacts at the plan-level directory, not inside subtask directories.
