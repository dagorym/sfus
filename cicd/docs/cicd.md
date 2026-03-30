# CI/CD Developer Workflows

## Manual CD workflow shim

GitHub Actions CD now starts from `.github/workflows/cd.yml` as a manual-only entrypoint:

- trigger: `workflow_dispatch`
- inputs:
  - `git_ref`: optional branch, tag, or commit SHA to check out before running CD
  - `run_publish`: optional boolean, defaults to `false`
  - `run_deploy`: optional boolean, defaults to `false`

The workflow stays thin and delegates stage behavior to the shared image runner plus shared config:

```bash
bash cicd/scripts/build-images.sh cicd/config/image-matrix.yml build
```

When a manual dispatch explicitly enables a later stage, the workflow reuses the same entrypoint with `publish` or `deploy`. Those operations are still future-facing gates: they succeed with a warning and do not publish or deploy anything by default. The default image matrix keeps both gates explicit with:

```yaml
defaults:
  publish_enabled: false
  deploy_enabled: false
```

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
