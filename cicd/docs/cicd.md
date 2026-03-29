# CI/CD Developer Workflows

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

### No-service behavior

`cicd/docker/compose.dev.yml` is scaffolded with no services yet. When the selected compose file has no services, `bash cicd/scripts/run-containers.sh` writes this warning to stderr and exits `0` without requiring Docker:

```text
Warning: no services are defined in <compose-file>; nothing to run.
```
