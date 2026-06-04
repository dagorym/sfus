---
name: "decision-tracking"
description: "Externalize and track an open-decision queue to reduce context cost during sequential resolution loops."
---

# Decision Tracking

Load this skill when an agent needs to track a queue of open decisions and resolve them one at a time, and when holding that state in context would otherwise consume unnecessary tokens.

## Tooling

- Use the colocated tool `decision_tracker.py` to initialize the decision queue, add items, mark decisions resolved, and inspect current state.
- The tool persists state to a JSON file whose path is supplied by the caller via `--state`.
- Commands: `init` (initialize queue), `add` (add a decision), `resolve` (mark resolved with answer and optional note), `show` (display current state).

## Required Actions

- Initialize the tracker with all known open decisions at the start of the resolution loop.
- After each user answer, call `resolve` to record the answer and any rationale note, then call `show` to confirm the updated state.
- Add newly discovered decisions with `add` if they surface during the loop.
- Keep tracker state synchronized with the actual resolution progress throughout the session.

## Limits

- Do not let tracker state replace the required user-facing discussion — the tracker records outcomes, it does not drive them.
- Do not use this skill for single-decision scenarios where context cost is not a concern.
