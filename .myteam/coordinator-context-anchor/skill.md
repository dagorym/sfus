---
name: "coordinator-context-anchor"
description: "Preserve myteam framework principles across context compaction cycles."
---

# Coordinator Context Anchor

Load this skill at the start of major orchestration phases (before launching agent cohorts) to refresh essential myteam framework knowledge in active context. This skill helps the Coordinator survive context compaction by re-establishing foundational principles that prevent drift into incorrect tool shortcuts or skipped workflow steps.

## Critical Framework Principles

These principles are non-negotiable and must be re-reinforced when context compaction threatens to obscure them:

### Myteam Skill Loading — Never Skip

1. **Always load skills through myteam first.** When a role or skill document says to load a skill, use `myteam get skill <skillname>` (for shared skills) or `myteam get skill <role>/<skillname>` (for nested skills). This is the ONLY correct path.

2. **Never substitute tool-native skills.** Do not bypass myteam and load `/code-review`, `/run`, or other tool-provided skills instead. Those are fallbacks for general-purpose usage outside orchestrated workflows, not alternatives for myteam skills. Doing so breaks the role coordination contract and loses role-specific context, governance, and workflow constraints.

3. **Shared skills vs. nested skills:**
   - Shared skills (e.g., `artifact-paths`, `repository-inference`, `handoff-prompt-contract`, `coordinator-context-anchor`) live at the top level of `.myteam/` and are ALWAYS loaded by bare name: `myteam get skill artifact-paths`
   - Nested/child skills (e.g., `coordinator/plan-intake`, `implementer/discovery`) are loaded with the role prefix: `myteam get skill coordinator/plan-intake`
   - Never use a role prefix for shared skills — `myteam get skill coordinator/artifact-paths` will fail.

### Isolated Subagent Contexts

1. **Each subagent (Implementer, Tester, Documenter, Security, Verifier, Reviewer) runs in isolated context.** They are launched as separate agents with their own role loads. The Coordinator does not inherit their context, and they do not inherit the Coordinator's context.

2. **Each subagent loads its own role automatically.** When you launch an Implementer, it will run `myteam get role implementer` (or equivalent) as part of its startup. Trust that load — do not try to embed role instructions in the handoff prompt.

3. **Keep implementation-stage conversation state out of the Coordinator's active context.** Launch downstream agents as isolated background tasks or separate-session launches, never in the Coordinator's own conversation. This boundary is essential for context preservation.

### Coordinator Role as Source of Truth

1. **The Coordinator's role definition IS the source of truth** for what the Coordinator should do, when it should load skills, and what constraints apply. If the Coordinator feels uncertain about its workflow, responsibilities, or constraints after compaction, re-read the active coordinator role in `.myteam/coordinator/role.md`.

2. **Do not trust memory of the role.** After context compaction, re-read the actual role file to confirm constraints, especially around:
   - When to load each skill (Skill Loading Rules section)
   - The required workflow order (Required Workflow section)
   - Hard constraints and limitations (Constraints section)

3. **The role definition evolves.** Always refer to the current `.myteam/coordinator/role.md` when composing major prompts (especially the final Reviewer prompt), not to memory of what the role said in a prior session.

### Tool-Only Git Worktree and Merge Operations

1. **Stage worktree creation, stage-chain merging, and stage cleanup are tool-only operations.** `create_worktree.py`, `merge_worktrees.py`, and `merge_to_implementer.py` from `coordinator/worktree-tools` are the ONLY permitted paths.

2. **Never run manual git equivalents for stage branches.** `git worktree add`, `git worktree remove`, `git merge`, and `git branch -d`/`-D` break lineage naming, skip cleanliness checks, and leave stale worktrees and branches behind.

3. **A tool failure is a stop signal, not permission to improvise.** Surface the error, fix the stated precondition or follow the permitted remediation flow, and re-run the same tool — never complete the operation manually.

## When to Load This Skill

Load this skill at the following checkpoints:

- **At the start of subtask orchestration** (immediately after plan intake completes)
- **Before launching major agent cohorts** (before the first Implementer launch for a batch of subtasks)
- **After significant compaction** (if context length suddenly drops and the Coordinator notices behavior drift)
- **Before the final Reviewer stage** (to ensure the Coordinator's prompt composition respects the active Reviewer definition)

## Limits

- This skill is a framework refresh, not a replacement for detailed role instructions. It re-establishes principles only. Refer to the full role definition for operational details.
- Do not use this skill to override explicit constraints in the Coordinator role or in downstream agent role definitions.
