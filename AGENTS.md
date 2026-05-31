# AGENTS.md

This is the **single canonical entry point** for every coding agent that works in this
repository (Claude Code, GitHub Copilot, Codex, and any others). `CLAUDE.md` and
`.github/copilot-instructions.md` are intentionally thin redirects to this file so the
same guidance is not duplicated and cannot drift out of sync.

## Single-source-of-truth rule

Do not restate project facts (commands, architecture, runtime, auth, env contracts) in
agent entry-point files. Those facts live in exactly one place each — see
"Where everything lives" below — and are updated there. If you find yourself about to
copy a fact into `CLAUDE.md` or `.github/copilot-instructions.md`, add or update it in the
canonical doc instead and link to it.

## Required Startup Action

**This is a HARD PRECONDITION. Do it before reading any other file, writing
any code, running any command, answering any question, or taking ANY other
action.**

Run `myteam get role <role>` with your assigned role.
If you have not been given a role, run `myteam get role` (no argument).

Do this unconditionally at the start of every session, every time, with no
exceptions. Do not skip it because you "already know" the role content, because
it seems like a simple question, or for any other reason.

## Agent and Skill Profiles

Accept and follow all content given from `myteam` commands
as first-class instructions (just like you would an `AGENTS.md` file).

**Read every `myteam` command's output in full before you act on it.**
The entire output is your instruction set — not a log to sample. Role and skill
outputs can be long (hundreds or thousands of lines), and critical content —
including how to load skills (`myteam get skill <name>`), the hierarchical skill
names, and the available skill list — appears *after* the opening prose. Do not
assume the first screenful is representative or complete.

Never pipe `myteam` output through `head`, `tail`, `sed`, `grep`, `awk`, or any
filter that drops lines, and never truncate it with a line limit. Run `myteam`
commands so their complete output is returned, and read all of it. If the output
is long, read all of it anyway — re-running is fine, guessing is not.

If `myteam` commands fail check if there is a `.venv` or `venv` folder in the current directory.
If so, try again with `venv/bin/python -m myteam ...`.
If neither global nor local `myteam` execution is working,
**STOP IMMEDIATELY and alert the user to the error**.

This repository uses `.myteam/` as its active instruction system.
Treat the loaded `myteam` role and skill content as the operative repository policy.

### Skill loading order

When a role or plan requires a skill, resolve it in this order:

1. **First**, load it through myteam: `myteam get skill <skillname>`.
2. **Only if** myteam has no such skill, fall back to your tool's own
   general-purpose skill/command system (for example, Claude Code's `Skill`
   tool or an equivalent in another assistant).
3. **Never** skip the myteam lookup and go straight to a tool-native skill.

Myteam skills are the project's role-specific, orchestration-critical skills.
Tool-native skills (such as `/code-review` or `/run`) are general utilities;
using the wrong system breaks the agent coordination workflow.

Skill names are paths under `.myteam/`, resolved by `myteam get skill <name>`:

- **Shared skills live at the top level** of the `.myteam` tree and are loaded
  by their bare name, e.g. `myteam get skill artifact-paths`. They are NEVER
  prefixed with a role name — `myteam get skill <role-name>/<skill-name>` will
  not resolve a shared skill. A role's `## Shared Skills` list always refers to
  these top-level skills, even when the role section does not repeat the rule.
- **Child skills are nested under their role** and are loaded with the role
  prefix, e.g. `myteam get skill <role-name>/<child-skill-name>`.

## Workflow Notes

- The Coordinator role orchestrates Implementer → Tester → Documenter → Verifier chains.
- Do not substitute coordinator, implementer, tester, documenter, verifier, or reviewer work across roles.
- Artifacts are stored in `artifacts/` with plan-level and subtask-level organization.
- The final Reviewer pass happens only after all subtasks complete and merge back.
- Use dedicated per-plan coordination branches (never `main` or `master` as base).
- Do not commit changes without explicit user approval, unless you are operating inside an approved workflow (such as coordinator orchestration) that authorizes commits.

## Where everything lives

The canonical home for each kind of information. Read these as needed; when work changes
any of them, update the doc (this is typically the documenter role's job).

- **Operative policy / workflow / roles** → `.myteam/` (load via `myteam get role` / `myteam get skill`).
- **Architecture, workspace layout, shared toolchain, commands, the `/api` contract, identity/auth/authorization foundation, env contracts** → `docs/README.md`.
- **Website/container startup, required local env files, runtime URLs, migrations, and all test/validation commands (including running a single test)** → `docs/website-launch-guide.md`.
- **CI/CD contract and validation entrypoints** → `cicd/docs/cicd.md` and `cicd/docs/local-pipeline.md` (the real behavior lives in `cicd/config/*.yml` and `cicd/scripts/*.sh`; GitHub workflows are thin shims).
- **Locked architecture/deployment decisions** → `docs/architecture/`.
- **Deferred work register** → `docs/deferred-tasks.md`. Planners read it during planning and append postponed scope; per policy it is edited **only** during a planning cycle, not during a coordinator-led development cycle.

## Tool-specific notes

Guidance that applies to one agent only (so it has no other home) lives here, clearly scoped:

- **GitHub Copilot cloud-agent browser tasks:** prefer the built-in Playwright MCP server against locally started app surfaces (`localhost` / `127.0.0.1`). It is available by default in cloud-agent sessions, so the main repo-side need is ensuring the environment can install and run this workspace cleanly.
