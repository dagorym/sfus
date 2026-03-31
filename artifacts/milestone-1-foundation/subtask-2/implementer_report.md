# Implementer Report - Milestone 1 Subtask 2 Remediation 1

## Summary
Implemented the remediation-only runtime contract fixes requested by verifier feedback:
1. Made production `web` and `api` containers truly long-lived.
2. Removed `migrate -> api` dependency so migrations are independently runnable pre-rollout.
3. Updated Subtask 2 validation coverage and docs to reflect/verify corrected runtime behavior.

## Plan Steps Completed
- Preflight scope check completed against Subtask 2 allowed surfaces and acceptance criteria.
- Applied runtime fixes in allowed files only:
  - `apps/web/Dockerfile`
  - `apps/api/Dockerfile`
  - `cicd/docker/compose.prod.yml`
- Updated in-scope validation/docs:
  - `cicd/tests/run-validations.sh`
  - `README.md`
  - `cicd/docs/cicd.md`
  - `cicd/docs/local-pipeline.md`
- Verified with existing validation command(s).

## Files Changed
- `apps/web/Dockerfile`
- `apps/api/Dockerfile`
- `cicd/docker/compose.prod.yml`
- `cicd/tests/run-validations.sh`
- `README.md`
- `cicd/docs/cicd.md`
- `cicd/docs/local-pipeline.md`

## Validation Commands Run
- `bash cicd/tests/run-validations.sh` (pass)
- `bash cicd/tests/run-validations.sh >/dev/null` (pass re-run)

## Validation Outcomes
- PASS: Subtask 2 runtime contract checks pass.
- Runtime checks now include:
  - Building production web/api images and asserting containers remain running (long-lived behavior).
  - Running `docker compose ... --profile migration run --rm --no-deps migrate ...` to prove independently runnable migrate path.

## Commits
- Implementation/code commit: `a32c0fe93725b344ad8d0d2acd59c635c6824b56`
- Artifact commit: pending at report write time.
