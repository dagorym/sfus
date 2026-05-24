---
name: "preflight"
description: "Establish feature-level review scope, recover plan and artifact context, and begin in the same run."
---

# Reviewer Preflight

Load this skill immediately after the reviewer has confirmed that blocking inputs are present and review should continue in the same run.

## Tooling

- Use the colocated tool `resolve_preflight.py` to normalize prompt hints, discover likely plan sources, recover upstream artifact directories and result files, and derive a default shared artifact directory before spending tokens on manual repository narration.

## Required Actions

- Identify the original feature plan being reviewed.
- Identify subtasks, branches, artifacts, and reports in scope.
- Resolve the reviewer artifact directory as a repository-root-relative path.
- Restate that the review is feature-level and read-only except for required reviewer artifacts.

## Startup Contract

- Do not treat the scope restatement as task completion.
- After the restatement, immediately inspect the governing plan or upstream review artifacts in the same run.
