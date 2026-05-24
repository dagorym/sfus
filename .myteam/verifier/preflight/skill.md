---
name: "preflight"
description: "Restate review scope, recover evaluation inputs, and begin review in the same run."
---

# Verifier Preflight

Load this skill immediately after the verifier has confirmed that blocking inputs are present and review work should continue in the same run.

## Tooling

- Use the colocated tool `resolve_preflight.py` to extract structured verifier-handoff inputs, normalize shared artifact path guidance, derive the task slug when needed, and gather repository-backed candidate plan and convention context before restating scope manually.

## Required Actions

- Confirm the review is being performed from an isolated worktree branched from the completed Documenter branch.
- Restate the review scope, including the Implementer, Tester, and Documenter changes in scope.
- Recover the governing plan, acceptance-criteria source, and convention-file guidance when provided or safely inferable.
- Reuse a provided shared artifact directory as a repository-root-relative path.
- If no shared artifact directory is provided, derive repository-root-relative `artifacts/<task-slug>` from the task name.
- When deriving `<task-slug>`, remove trailing agent-role suffixes such as `implementer`, `tester`, `documenter`, and `verifier`.
- Label inferred evaluation-source or convention-file choices as assumptions.

## Startup Contract

- Do not treat the scope restatement as task completion.
- After the restatement, immediately inspect the governing plan source, combined diff, or convention files in the same run.
