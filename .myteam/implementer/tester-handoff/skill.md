---
name: "tester-handoff"
description: "Compose the success-path Tester handoff for stdout and tester_prompt.txt."
---

# Implementer Tester Handoff

Load this skill only when the implementation has reached the success path and the downstream Tester prompt is about to be written or reported.

## Tooling

- When the handoff content is ready, use the colocated artifact-writing tool path to render `tester_prompt.txt` and the stdout prompt block instead of manually reproducing the full prompt template.

## Purpose

Use this skill to produce a ready-to-run Tester handoff that allows testing to begin immediately without another clarification turn.

## Required Content

The Tester handoff must include:

- modified files
- acceptance criteria from the Planner
- exact test file location guidance when known, otherwise the most likely location labeled as an assumption
- implementation context including behavior changes, relevant entry points, flags or config, and important edge cases
- exact validation or test commands when known, otherwise the smallest relevant existing test command(s) labeled as assumptions
- any existing validations that fail only because approved behavior intentionally changed
- the shared repository-root-relative artifact directory path to reuse

## Stdout And File Contract

- In stdout, present the handoff as a `Tester Agent Prompt` block.
- In `tester_prompt.txt`, omit the heading line `Tester Agent Prompt` and write only the handoff body.
- Start the handoff body with the exact line `Your role is 'tester'. Your task is as follows:`

## Limits

- Do not replace the exact opening line with looser wording.
- Do not omit required sections just because the rendering is delegated to a tool.
