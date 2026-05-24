---
name: "framework-discovery"
description: "Identify the existing testing framework, conventions, and smallest meaningful commands."
---

# Tester Framework Discovery

Load this skill only when the testing framework, test conventions, or smallest relevant existing command must be confirmed.

## Tooling

- Use the colocated tool `discover_test_context.py` to gather general repository evidence for framework markers, likely test directories, workflow files, and candidate commands before selecting the smallest meaningful command.

## Required Actions

- Identify the existing testing framework in use, such as `pytest`, `Jest`, or `JUnit`.
- Review relevant test configuration files and existing tests to match project conventions.
- Determine naming conventions, import patterns, assertion styles, fixtures, and helper usage.
- If exact test commands are not provided, select the smallest relevant existing command from repository conventions and label the choice as an assumption.
- Use tool output to reduce repeated repository scanning, but keep the final command and convention choice with the tester agent.

## Output Requirements

- State the framework selected.
- State the exact command(s) to run when known.
- Label inferred commands or conventions as assumptions.

## Limits

- Do not introduce a new test framework.
- Do not broaden the command scope unnecessarily when a smaller relevant command exists.
