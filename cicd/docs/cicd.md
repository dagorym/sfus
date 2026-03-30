# CI/CD Developer Workflows

## GitHub Actions CI shim

GitHub Actions must keep its platform entrypoint in `.github/workflows/ci.yml`, but the workflow is intentionally thin. It triggers on `push` and `pull_request` for `main`, plus `workflow_dispatch` for manual runs, then delegates execution to the shared validation runner:

```bash
bash cicd/scripts/run-validations.sh cicd/config/validation-config.yml
```

That keeps GitHub Actions aligned with the same `cicd/scripts` and `cicd/config` contract used for local validation runs instead of duplicating validation logic in the workflow file.

### Warning behavior in Actions

`bash cicd/scripts/run-validations.sh` still writes warning-only conditions to stderr without failing the run. When `GITHUB_ACTIONS=true`, the runner also emits the same warning as a GitHub Actions annotation in `::warning::...` format so CI logs surface the warning while preserving the existing warning-only success semantics.

## Manual CD workflow shim

GitHub Actions CD now starts from `.github/workflows/cd.yml` as a manual-only entrypoint:

- trigger: `workflow_dispatch`
- inputs:
  - `git_ref`: optional branch, tag, or commit SHA to check out before running CD
  - `run_publish`: optional boolean, defaults to `false`
  - `run_deploy`: optional boolean, defaults to `false`
  - `dockerhub_namespace`: future publish-only Docker Hub namespace or organization
  - `dockerhub_repository_prefix`: future publish-only optional repository prefix

The workflow stays thin and delegates stage behavior to the shared image runner plus shared config:

```bash
bash cicd/scripts/build-images.sh cicd/config/image-matrix.yml build
```

The shared runner is also safe to call from strict Bash entrypoints such as `bash -e`, so manual dispatches and local strict-shell invocations parse the image matrix the same way.

When a manual dispatch explicitly enables a later stage, the workflow reuses the same entrypoint with `publish` or `deploy`. Those operations are still future-facing gates: they succeed with a warning and do not publish or deploy anything by default. The default image matrix keeps both gates explicit with:

```yaml
defaults:
  publish_enabled: false
  deploy_enabled: false
```

### Future Docker Hub publish contract

The current publish stage is still a placeholder. Even when `run_publish` is set to `true`, the active workflow only calls:

```bash
bash cicd/scripts/build-images.sh cicd/config/image-matrix.yml publish
```

That means the current shim does **not** run `docker/login-action`, does **not** execute `docker push`, and still leaves publish disabled by default unless a manual dispatch explicitly enables the stage.

The future Docker Hub enablement contract is now documented without activating it:

- `.github/workflows/cd.yml` exposes `dockerhub_namespace` and optional `dockerhub_repository_prefix` as manual-dispatch inputs for a later publish pass.
- The same publish job placeholder already reserves `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` as the intended future secret names.
- Docker Hub login belongs in the `.github/workflows/cd.yml` `publish` job immediately before the shared `publish` runner invocation, but that login step is not active yet.
- `cicd/config/image-matrix.yml` remains the single source of truth for future publish naming. A later enablement pass should derive Docker Hub image names from each `images[].tag` entry there instead of duplicating names inside the workflow.

## Local container scaffold

Use the shared container runner from the repository root:

```bash
bash cicd/scripts/run-containers.sh
```

The default action is `start` (`docker compose up -d`) using:

```bash
cicd/docker/compose.dev.yml
```

Supported actions:

- `start` or `up`: run `docker compose up -d`
- `run`: run `docker compose up`
- `stop` or `down`: run `docker compose down`
- `status` or `ps`: run `docker compose ps`
- `logs`: run `docker compose logs`

If the first argument is not one of those actions, the runner treats it as a custom compose file path and keeps `start` as the default action unless you pass an action next.

Examples:

```bash
bash cicd/scripts/run-containers.sh start
bash cicd/scripts/run-containers.sh run
bash cicd/scripts/run-containers.sh stop
bash cicd/scripts/run-containers.sh status
bash cicd/scripts/run-containers.sh logs
```

You can also pass a custom compose file:

```bash
bash cicd/scripts/run-containers.sh path/to/compose.dev.yml start
```

The runner treats a compose file as configured when `services` contains either an inline map such as `services: {app: {image: busybox}}` or block-style service keys indented beneath `services:`. Inline-map detection still works when the same `services:` line ends with a trailing YAML comment, for example `services: {app: {image: busybox}} # local override`. That keeps custom compose files working even when their YAML uses inline definitions, inline definitions with trailing comments, or service keys that are not indented with a fixed number of spaces.

### No-service behavior

`cicd/docker/compose.dev.yml` is scaffolded with no services yet. When the selected compose file has no services, `bash cicd/scripts/run-containers.sh` writes this warning to stderr and exits `0` without requiring Docker:

```text
Warning: no services are defined in <compose-file>; nothing to run.
```
