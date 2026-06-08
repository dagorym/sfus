---
name: "tree-sync"
description: "Mirror the canonical .myteam tree to and from downstream repositories with preserve-aware deletion and loud divergence reporting."
---

# Agent Builder Tree Sync

Load this skill only when `.myteam` instruction changes must be propagated
between this canonical repository and the downstream repositories listed in
the colocated `targets.yaml`.

## Tool

- Use the colocated `sync_myteam.py` to mirror the canonical `.myteam` tree:
  - Dry run (default): `python sync_myteam.py` — prints the full per-target
    plan (CREATE / UPDATE / DELETE / PRESERVED / PRESERVED-DIVERGENT) and
    changes nothing.
  - Apply: `python sync_myteam.py --apply` — executes the plan; refuses to run
    when the destination `.myteam` has uncommitted git changes.
  - Pull (reverse direction): `python sync_myteam.py --pull <name> [--apply]`
    — mirrors one named target's `.myteam` back into this canonical
    repository. Exactly one target per pull.
  - Limit to specific targets: `--target <name>` (repeatable), matching the
    `name` entries in `targets.yaml` (push direction only).
  - Exit codes: 0 = clean sync, 3 = synced but PRESERVED-DIVERGENT files need
    manual review, 1 = aborted with an error.
- Preserve lists are direction-agnostic: a target's preserved paths are owned
  by that repository and are never synced in either direction; divergence
  from the canonical counterpart is reported, not resolved.
- Deletion is how moves propagate: a file moved in the source tree shows up
  as CREATE at the new path plus DELETE at the old path. Do not "protect"
  stale files by adding them to preserve lists.

## Required Actions

- Always run the dry run first and review the plan — especially DELETE and
  PRESERVED-DIVERGENT entries — before requesting approval to apply.
- Treat `--apply` as an approval-gated write: get explicit user approval for
  the reviewed plan first.
- Before applying a pull, confirm the downstream tree is current: review every
  DELETE in the pull plan against recent canonical commits — a stale
  downstream tree shows newer canonical files as deletions, and applying that
  plan would discard canonical work. A push dry run that reports pending
  changes unrelated to your downstream edits means the downstream is stale;
  do not pull from it until it is re-synced.
- After applying, resolve every PRESERVED-DIVERGENT file by hand: diff the
  canonical version against the preserved target file and apply the relevant
  hunks manually, keeping the target's repo-specific content. Recorded
  intentional divergence that contains no new content from the source side
  needs no action.
- When the canonical change set also touched repo-specific counterparts
  (`AGENTS.md`, `config/subagent-models*.yaml`), propose equivalent manual
  edits in each target; the tool deliberately does not touch them.
- Commit in each modified repository only with explicit user approval, citing
  the source commit being synced in the message.
- When a target intentionally diverges (a repo-specific node or file), record
  it in `targets.yaml` under that target's `preserve` list in the same change.

## Limits

- Never run `--apply` when the destination repository's `.myteam` has
  uncommitted git changes (the target on push; this canonical repo on pull).
- Never pull from more than one target in a single operation.
- Never let the tool modify preserved paths; manual merges only.
- The tool never commits; git history in all repositories stays
  operator-controlled.
- Scope is the `.myteam` tree only.
