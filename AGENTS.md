# AGENTS.md

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

## Project documentation
When needed read the following files.  When changes are made to the repository, these files should all be checked and updated as appropriate.  This is typically the job of the documenter role.

* Project architecture and design notes: `docs/README.md` file.
* Website configuration and launch instructions: `docs/website-launch-guide.md` 
* Deferred work register: `docs/deferred-tasks.md` file. Future planners should read it during planning and append new deferred-scope items when decisions intentionally postpone work. This file should only be edited during a planning cycle not during a coordinator led development cycle.
