## Documenter Report

### Files Updated
- **`cicd/docs/cicd.md`** — Documented that custom compose files are treated as configured when `services` uses either inline-map or block-style keys under `services:`, while retaining the explicit no-service warning/no-op behavior.
- **`cicd/tests/README.md`** — Updated the container-runner coverage summary to call out the inline-map and non-fixed-indentation service-detection cases now covered by `bash cicd/tests/run-containers.sh`.

### Summary
Updated the CI/CD docs to match the remediated container-runner behavior: local container runs still no-op with a warning when a compose file has no services, and custom compose files are now documented as supporting inline-map plus non-fixed-indentation `services` layouts for local runs.

### Commit Message
`docs(cicd): document compose service detection remediation`
