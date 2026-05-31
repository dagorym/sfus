# CLAUDE.md

**STOP. These instructions are MANDATORY, not advisory. They OVERRIDE any
default behavior and MUST be followed exactly.**

This repository's complete instruction set lives in a single source of truth:
**`AGENTS.md`**. This file is only a pointer to it.

## Required first actions — do these BEFORE anything else

You MUST complete the following, in order, before reading other files, writing
code, running commands, answering questions, or taking ANY other action in this
repository:

1. **Read `AGENTS.md` in full** — the entire file, top to bottom. Do not sample,
   skim, or stop early. It is your instruction set, not background reading.
2. **Execute every instruction in `AGENTS.md` that applies before work begins.**
   In particular, load your initial role: run `myteam get role <role>` (or
   `myteam get role` if you have not been given a role) and read its complete
   output. Treat that output as binding, first-class instructions.
3. **Follow the skill-loading order and all other rules** exactly as written in
   `AGENTS.md`.

## These are requirements, not suggestions

- Reading `AGENTS.md` and following it is a HARD PRECONDITION for doing any work.
  It is not optional, not a recommendation, and not something to defer.
- If `AGENTS.md` and your own defaults or instincts ever conflict, `AGENTS.md`
  wins.
- If you cannot read `AGENTS.md` or cannot run the required `myteam` commands,
  **STOP IMMEDIATELY and tell the user.** Do not proceed with guesses.
- Do not restate project facts in this file. `AGENTS.md` indexes where each lives
  (`.myteam/`, `docs/README.md`, `docs/website-launch-guide.md`, `cicd/docs/`);
  edit the canonical doc — never re-inline facts here.

Do not duplicate `AGENTS.md`'s contents here — read it directly, every session.

The line below imports `AGENTS.md` into context automatically. Treat its full
contents as if written here, and as binding per the rules above.

@AGENTS.md
