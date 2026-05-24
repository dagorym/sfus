---
name: "convention-review"
description: "Review compliance with repository instruction files and project-local conventions."
---

# Verifier Convention Review

Load this skill only when checking changed files against repository instruction files and project-local conventions.

## Tooling

- Use the colocated tool `discover_convention_files.py` to rank likely governing instruction and convention files from repository evidence and changed-path context before reading them manually.

## Required Actions

- Check changed code against repository instruction files such as `AGENTS.md`, `CLAUDE.md`, and other project-local convention files in scope.
- Identify violations of naming, structure, workflow, testing, or documentation conventions that materially affect maintainability or compliance.
