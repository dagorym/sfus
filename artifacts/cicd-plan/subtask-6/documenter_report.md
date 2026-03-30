## Documenter Report

### Files Updated
- **`cicd/docs/cicd.md`** — Documented that the shared `build-images.sh` runner remains safe to invoke from strict Bash entrypoints such as `bash -e`, matching the remediated parsing behavior used by the manual CD shim.
- **`cicd/tests/README.md`** — Updated the CI/CD test coverage summary to reflect strict-parent-shell regression coverage and the explicit workflow check that `.github/workflows/cd.yml` only references `cicd/scripts` and `cicd/config` assets.

### Summary
Updated the existing CI/CD docs to capture the remediated strict-shell behavior in the shared image runner and refreshed the test documentation so it matches the added regression coverage for strict-parent-shell invocation and CD workflow asset-path constraints.

### Commit Message
`docs: document subtask 6 strict-shell remediation`
