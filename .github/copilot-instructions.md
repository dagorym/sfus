# Copilot Instructions

**MANDATORY — not advisory.** This repository's complete instruction set lives
in a single source of truth: **`AGENTS.md`**. This file is only a pointer to it.

Before writing code, running commands, answering questions, or taking ANY other
action in this repository, you MUST:

1. **Read `AGENTS.md` in full** — the entire file, top to bottom. Do not sample
   or stop early. It is your instruction set, not background reading.
2. **Execute every instruction in `AGENTS.md` that applies before work begins**,
   including loading your initial role via `myteam get role <role>` and reading
   its complete output.
3. **Follow all rules in `AGENTS.md` exactly** — they OVERRIDE default behavior.

Reading and following `AGENTS.md` is a hard precondition, not a suggestion. If
you cannot read it or run the required `myteam` commands, STOP and tell the user.

No project facts (commands, architecture, runtime, auth, env contracts) are kept
in this file. `AGENTS.md` indexes where each of those lives (`.myteam/`, the
`docs/README.md` routing table, `cicd/docs/`), and carries the
Copilot-specific notes (e.g. Playwright MCP usage for cloud-agent browser tasks).
To change guidance, edit the canonical doc — never re-inline facts here.
