# Handoff: Drupal rebuild evaluation — conversation context

Load this file to restore the context of the Drupal feasibility conversation on
another machine (where the legacy Drupal 5 site's code lives). It captures what was
decided, what's still open, and exactly what to do next.

## What this is

We are evaluating rebuilding the Star Frontiers RPG community website
(`star_frontiers_rpg_website_design.md`) on **traditional Drupal**. The current
repo (`sfus`) contains an in-progress **custom TypeScript** implementation
(NestJS + Next.js), but this evaluation is a **clean-slate "could/should we use
Drupal instead" exploration** — no constraints from the current repo are hard
(MySQL version, stack, etc. can all change).

**New fact established mid-conversation:** This is actually an **upgrade/rebuild of
an existing Drupal 5 site** that is still live. That D5 site had custom ("not
necessarily good") work hacked in to provide the projects structure we're trying to
recreate. There is **no code-upgrade path from Drupal 5** — this is a rebuild + a
content migration. The legacy code/schema is on a different computer (hence this
handoff file).

## Decisions made

1. **Traditional Drupal**, not decoupled/headless. (User chose this.)
2. **Drupal 11**, greenfield, modern DB (MariaDB/MySQL 8/Postgres).
3. **Group module, NOT Organic Groups** — OG was the D7 standard; Group (3.x) is the
   maintained successor and the right tool for per-project structure.
4. The **critical, must-be-solid requirement**: per-project permissions with all
   project content (forums, wiki/documents, downloads, blog) gated behind
   **membership + per-project role rules**. Everything else is secondary.

## Key findings

- Per-project gating is **solid** on Group — it's built on Drupal's mature
  node-access grant system; node-based content (blog, wiki, downloads) gates
  cleanly via the Group Node (`gnode`) plugin.
- **Forums:** do NOT use core Forum (taxonomy-based, not group-aware). Model forum
  threads as group-content nodes + comments + Views. Gating is solid; only the
  forum UI is rebuilt.
- **Public vs private per project:** the one non-config piece. Group outsider
  permissions are per-group-type, so a per-instance toggle needs either two group
  types (config-only, simple) or a small custom access-record hook (recommended for
  production).
- **Group roles/permissions are per-group-TYPE config**, not per-project dynamic.
  The design's fixed four roles (Viewer/Member/Moderator/Project Admin) fit
  perfectly. The ONE thing Group can't do natively: let a project owner mint custom
  per-project roles at runtime. **Must check whether the D5 site did this.**
- ~70–80% of design sections 1–5 = core + mature contrib. Genuinely custom on any
  platform: character generator (§5.4), ranked/realtime "what's new" feed (§5.9),
  the "unlisted" visibility state.

## Deliverable already written

**`drupal_projects_gating_blueprint.md`** (in this repo) — the full feasibility map
plus a concrete, standable spike: Drupal 11 + Group config, four node types, the
`project` group type, four group roles, the full permission matrix, public/private
options, forums-as-group-content, project sub-section Views, access-aware search,
and a 7-point verification checklist. Read it alongside this handoff.

## TODO on the machine with the legacy code

Review the running **Drupal 5** site for **intent and data** (not reuse). Pull out:

1. The **custom projects module(s)** — especially `hook_node_grants()` /
   `hook_node_access_records()` (the real per-project access logic) and the project
   sub-section routing/menus.
2. The **DB schema** for the project + membership tables, plus a few sample rows
   showing the project roles and membership states actually in use. This drives the
   Drupal Migrate plan.
3. A plain-English list of "things projects can do today" that users depend on.

**The decisive question to answer from that code:** did the old site allow
**per-project custom roles/permissions** (owners defining their own roles)? If yes,
that's the one requirement outside Group's native model and needs custom design. If
no (fixed role set), the blueprint as written covers it.

## How to resume

Share the items above (custom module source + schema + sample data) with the agent.
Then: reconcile the blueprint's role set and the public/private mechanism (step 4.6)
with what's actually running, and produce a **Drupal Migrate outline** for moving D5
content into the new Group-based structure.

## Reference files in this repo

- `star_frontiers_rpg_website_design.md` — the target product/technical design.
- `drupal_projects_gating_blueprint.md` — the feasibility eval + spike blueprint.
- `drupal_evaluation_handoff.md` — this file.
