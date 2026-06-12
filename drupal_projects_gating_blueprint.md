# Drupal Feasibility & Per-Project Gating Blueprint

Companion to `star_frontiers_rpg_website_design.md`. Evaluates building that design
on **traditional (non-decoupled) Drupal**, and gives a concrete, standable spike
for the load-bearing requirement: **per-project permissions with all project
content (forums, wiki/documents, downloads, blog) gated behind membership and
per-project role rules.**

> Context: This is a **greenfield rebuild** of an existing **Drupal 5** site that
> had custom ("not necessarily good") work hacked in to provide a projects
> structure. There is **no upgrade path** from Drupal 5 — this is a rebuild plus a
> content migration. The live D5 code/schema is the real spec and should be
> reviewed before finalizing (see "Open questions / needed from the legacy site").

---

## 1. Bottom line

The design is a **strong fit for traditional Drupal** — it is essentially what
drupal.org itself is built from (users, forums, projects, downloads, docs, feeds).
Roughly **70–80% of the core structure (design sections 1–5) is core + mature
contrib**; the remainder is custom work that would be custom on any platform
(character generator, ranked/realtime "what's new" feed).

**Decisions locked for this evaluation:**

1. **Traditional Drupal** (server-rendered theme), not decoupled.
2. **Use the `Group` module, not Organic Groups.** OG was the Drupal 7 gold
   standard; for a greenfield Drupal 11 build the actively-maintained successor is
   **Group** (3.x). It models group types, per-group roles, per-group permissions,
   group-scoped content, and public/private groups — exactly design section 6.

---

## 2. Feasibility map (design sections 1–5)

Level: **Core** = ships with Drupal · **Contrib** = mature off-the-shelf module ·
**Custom** = you build it.

| Design element | Drupal approach | Level |
|---|---|---|
| §1 Community hub (users/news/forums/files/wiki/groups) | Drupal's core use case | Core |
| §2 Global roles (guest/member/mod/admin) | Core roles & permissions | Core |
| §2 Project-scoped roles | Group per-group roles & permissions | Contrib |
| §2 ACL visibility (public/unlisted/members/project-only/private) | Node access + Group access; "unlisted" needs light custom | Contrib + Custom |
| §2 Access-aware search | Search API + Solr/OpenSearch with node-access integration | Contrib |
| §3 Top-level sections | Menu system + Views | Core |
| §3 Project sub-sections (same structure, scoped) | Group content + contextual Views | Contrib |
| §4 External OIDC/OAuth (Google/FB/GitHub) | OpenID Connect + Social Auth suite | Contrib |
| §4 Local auth + email verification | Core | Core |
| §4 Unique username + display name + @mentions | Core username + Real Name + Mentions | Core + Contrib |
| §4 MFA (TOTP) | TFA (Two-Factor Authentication) | Contrib |
| §4 Multiple linked identities | OpenID Connect multi-provider connect | Contrib |
| §5.1 Blog (posts/tags/scheduling/threaded comments) | Node + Comment + Taxonomy + Scheduler + Media | Core + Contrib |
| §5.2 Forums | **Do not use core Forum** (taxonomy-based, not group-aware). Model as group-content node + comments + Views | Core + Custom presentation |
| §5.3 Downloads (versioned releases, scan, counts) | Node + private file field; ClamAV; counts/checksums light custom | Contrib + Custom |
| §5.4 Characters — data + gallery | Node + Paragraphs + Views gallery | Core + Contrib |
| §5.4 Characters — generator (seeded random, rule tables, JSON/PDF) | **No off-the-shelf equivalent.** Custom module; Entity Print for PDF | Custom |
| §5.5 Documents/wiki (tree, revisions, diff, slugs, locking) | Book + core revisions + Diff + Pathauto + Content Lock + Message Subscribe | Core + Contrib |
| §5.6 Projects (mini-hubs) | Group module | Contrib |
| §5.7 Standalone pages (blocks/hero/CTA) | Core Page + Layout Builder | Core |
| §5.8 Nav bar (ordered, role-visible, dropdowns) | Core menus + Menu Per Role | Core + Contrib |
| §5.9 "What's New" feed | Message + Message Subscribe + Flag + Views; **ranking/personalization custom; realtime external (Mercure/SSE) or polling** | Contrib + Custom |
| §5.10 Notifications & follows | Flag + Message + Message Subscribe + Message Digest | Contrib |

**Genuinely custom (any platform):** character generator; ranked/realtime
personalized feed; the "unlisted" visibility state; some forum moderation polish.

**Free with Drupal that the design treats as work:** moderation (Content
Moderation + Workflows core), admin console, user/role management, revisions,
audit/reports, nav editor, theming, and most of the data-model build (entities via
UI, not hand-written migrations).

---

## 3. Per-project gating: how the Group model satisfies the requirement

Group gives three layers that line up with design §2:

- **Group type** — one type, `Project`. Every project is an instance.
- **Group roles** (per group type) — `Viewer`, `Member`, `Moderator`,
  `Project Admin`, plus built-in *Outsider* (anonymous + authenticated non-member)
  roles used for public/private.
- **Group permissions** — a per-group-type matrix mapping roles to capabilities;
  enforcement is **per individual project** based on the user's membership/role in
  *that* project.

**Content gating** works via the **Group Node** (`gnode`) relationship plugin:
mark a content type as group content and Drupal's node-access grant system hands
control to Group. On a **private** project a non-member gets a hard access-denied —
at the node, in listings, in menus, and (with Search API node-access integration)
in search results, facets, and counts. This is the well-tested, reliable path and
is built on Drupal's mature node-grant system.

### Important nuance (state it plainly)

Group roles/permissions are defined at the **group-type level** (site config), not
invented per-project at runtime by owners. Each project assigns its members to
those roles, but the *set* of roles and what each can do is shared across all
projects. The design's **fixed four-role set fits perfectly.** The one thing Group
does *not* do out of the box is let a project owner mint a brand-new custom role
with arbitrary permissions for just their project. If the legacy D5 site allowed
that, it becomes real custom work — verify against the old code.

---

# 4. The standable spike

Goal: one `Project` group type, four roles, blog/wiki/downloads/forum gated behind
membership, proven end-to-end with test users. Mostly configuration; the only
custom piece is the per-instance public/private toggle (step 6).

## 4.0 Platform & modules

- **Drupal 11**, PHP 8.3+, MariaDB 10.6+ / MySQL 8 / PostgreSQL, **private
  filesystem enabled**.
- Contrib:
  - `group` (+ **Group Node** / `gnode` submodule) — the engine.
  - `grequest` (Group Membership Request) — request-to-join / approval.
  - `ginvite` (Group Invite) — invitations.
  - `search_api` (+ `search_api_solr`, or DB backend for the spike) — access-aware search.
  - Later phases (not needed for the gating spike): `book` (core), `diff`,
    `pathauto`, `content_lock`, `scheduler`, `flag`, `message` / `message_subscribe`.

## 4.1 Content types (nodes)

| Node type | Key fields | Purpose |
|---|---|---|
| `project_blog` | title, body, image | §5.1 project blog |
| `project_doc` | title, body; Book-enabled | §5.5 project wiki |
| `project_download` | title, body, **file (private://)** | §5.3 project downloads |
| `project_topic` | title, body; comments on | §5.2 forum thread (see 4.7) |

`project_download` **must** use the private file system so file access follows node
access.

## 4.2 Group type

Create group type **`project`**. Enable "creator gets membership" and auto-assign
the creator the `project_admin` role.

## 4.3 Group content (relationship) plugins

On `project`, install a **Group Node** relationship for each node type:
`group_node:project_blog`, `group_node:project_doc`, `group_node:project_download`,
`group_node:project_topic`. This hands node access to Group.

## 4.4 Group roles

On `project`, define individual group roles: `project_viewer`, `project_member`,
`project_moderator`, `project_admin` (plus the built-in Outsider/anonymous roles).

## 4.5 Permission matrix (the load-bearing artifact)

Configure on the `project` group type permissions page. "Outsider" = non-members.
Representative Group permission names shown — confirm exact strings in the UI.

| Capability (Group permission) | Outsider | Viewer | Member | Moderator | Proj Admin |
|---|---|---|---|---|---|
| View group entity (`view group`) | private:– / public:✔ | ✔ | ✔ | ✔ | ✔ |
| View blog/doc/download/topic (`view group_node:* entity`) | private:– / public:✔ | ✔ | ✔ | ✔ | ✔ |
| Create content (`create group_node:* entity`) | – | – | ✔ | ✔ | ✔ |
| Edit **own** content (`update own group_node:*`) | – | – | ✔ | ✔ | ✔ |
| Edit **any** content (`update any group_node:*`) | – | – | – | ✔ | ✔ |
| Delete **any** / lock / pin | – | – | – | ✔ | ✔ |
| Post comments (comment field access) | – | – | ✔ | ✔ | ✔ |
| Request to join (`request group membership`) | private:✔ / public:join | – | – | – | – |
| Manage members (`administer members`) | – | – | – | – | ✔ |
| Invite members (`invite users to group`) | – | – | – | ✔ | ✔ |
| Edit group settings (`edit group`) | – | – | – | – | ✔ |

The distinction that matters — **Viewer reads only; Member touches own; Moderator
touches any; Project Admin manages people** — is entirely expressed here. That is
the proof point.

## 4.6 Public vs. private project (the one non-config piece)

Group's outsider permissions are **per group type**, so ticking "Outsider can view"
makes *every* project public. For a **per-instance** toggle, pick one:

- **(A) Two group types** — `project_public` / `project_private`, identical roles,
  different outsider permissions. Pure config; duplicates setup; complicates "same
  structure." Good for the spike to prove gating fast.
- **(B) A `visibility` field on the group + a small custom access-record hook** that
  downgrades grants when `visibility = private`. One group type; matches the
  design's per-project toggle. Recommended for production.

This is exactly where the **D5 site's `hook_node_grants` logic** should drive the
final choice. Known, scoped custom work — not a surprise.

## 4.7 Forums as group content (not core Forum)

Core Forum is taxonomy-based and not group-aware. Instead:

- `project_topic` node = the thread; **comments** = replies.
- A **View** "Project Forum": lists `project_topic` nodes, **contextual filter =
  Group ID from URL**, sorted by last comment — the per-project board index.
- Moderation (lock/pin) = boolean fields on `project_topic` gated by the Moderator
  permission.

Access gates correctly (it is group content); only the forum *presentation* is
rebuilt in Views.

## 4.8 Project sub-section pages ("same structure, scoped" IA)

Each sub-section is a **View with Group ID as contextual filter**, placed as group
tabs/local tasks so a project renders as Overview + Forums + Documents + Downloads
(design §3):

- `Project Overview` — recent items across all four content types in the group.
- `Project Blog`, `Project Docs` (Book tree), `Project Downloads`, `Project Forum`.

## 4.9 Search (access-aware)

Add the `project_*` node types to a Search API index with **content access /
node-grants processing enabled**, so Group membership filters results, facets, and
counts. Private-project content must never leak to non-members.

## 4.10 Verification checklist (spike pass/fail)

Two projects (one public, one private); five users: outsider, viewer, member,
moderator, project-admin. Confirm:

1. Outsider on **private** project → access-denied on every node, absent from
   listings, absent from search results **and counts**, private download URL 403s.
2. Outsider on **public** project → can read, cannot create/comment, can request
   to join.
3. Viewer → reads everything; create/comment buttons absent and direct POST denied.
4. Member → creates content; edits/deletes **own** only; can comment.
5. Moderator → edits/deletes **any** content; can lock/pin a topic.
6. Project Admin → invites/approves/removes members; edits project settings.
7. Membership states: invite (pending → active), request-to-join approval, removal.

All seven holding = architecture proven; the rest of the build is low-risk.

---

## 5. Open questions / needed from the legacy D5 site

Review the running D5 code/schema for **intent and data**, not reuse:

1. The **custom projects module(s)** — especially `hook_node_grants()` /
   `hook_node_access_records()` (the real access logic) and project sub-section
   routing/menus.
2. The **DB schema** for project/membership tables + sample rows (project roles and
   membership states actually in use) — drives the **Migrate** plan.
3. A plain-English list of "things projects can do today" users would revolt over
   losing.

Key thing to confirm: **did the old site allow per-project custom roles/permissions?**
If yes, that is the one item outside Group's native model and needs custom work.

## 6. Recommended next steps

1. Build the spike (steps 4.0–4.10), public/private via option (A) first.
2. Pull in the D5 code; reconcile the role set + step 4.6 with reality; draft a
   Migrate outline for existing content.
3. Move to production design of the public/private toggle (option B) and the
   non-gating phases (characters, feed, notifications).
