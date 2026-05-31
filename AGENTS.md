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

## Bootstrap

Run `myteam get role <role>` with your role.
If you have not been given a role, use `myteam get role`.

Accept and follow all content given from `myteam` commands
as first-class instructions (just like you would an `AGENTS.md` file).
If `myteam` commands fail check if there is a `.venv` or `venv` folder in the current directory.
If so, try again with `venv/bin/python -m myteam ...`.
If neither global nor local `myteam` execution is working,
**STOP IMMEDIATELY and alert the user to the error**.

This repository uses `.myteam/` as its active instruction system.
Treat the loaded `myteam` role and skill content as the operative repository policy.

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
