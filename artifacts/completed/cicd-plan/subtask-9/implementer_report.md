Plan step status
- Preflight scope check: completed (task goal, allowed files, acceptance criteria, validation command confirmed).
- Implement incrementally: completed (added repository structure constraints section in cicd/docs/cicd.md).
- Validate after change: completed (`bash cicd/tests/run-validations.sh` passed after documentation update).
- Completion gate: completed (diff limited to allowed docs file; acceptance criteria satisfied; artifact files prepared).

Files changed
- cicd/docs/cicd.md

Validation commands run
- bash cicd/tests/run-validations.sh (baseline)
- bash cicd/tests/run-validations.sh (post-change regression)

Validation outcomes
- PASS: Linux validation coverage succeeded for both runs.

Acceptance criteria mapping
1. CI/CD operational logic belongs under `cicd/`.
   - Satisfied by new "Repository structure constraints" section explicitly stating operational logic belongs in `cicd/`.
2. `.github/workflows/*.yml` are platform-required entrypoints and should stay thin.
   - Satisfied by explicit guidance to keep workflow files thin and platform-entrypoint focused.
3. Guidance points maintainers to shared scripts/config instead of duplicated workflow logic.
   - Satisfied by bullets directing behavior into `cicd/scripts/*.sh` and `cicd/config/*.yml`, and prohibiting duplicated workflow YAML logic.
4. Repository-wide guidance updated only if needed.
   - Satisfied by leaving `AGENTS.md` unchanged because detailed repository-wide guidance was not needed beyond `cicd/docs/cicd.md`.

Artifacts written
- artifacts/cicd-plan/subtask-9/implementer_report.md
- artifacts/cicd-plan/subtask-9/tester_prompt.txt
- artifacts/cicd-plan/subtask-9/implementer_result.json
