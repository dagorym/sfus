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

- `start` or `up`: run in detached mode
- `run`: run in foreground
- `stop` or `down`: stop and remove containers
- `status` or `ps`: list compose service status
- `logs`: stream service logs

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

`cicd/docker/compose.dev.yml` is scaffolded with no services yet. When no services are defined, `bash cicd/scripts/run-containers.sh` prints a warning and exits successfully without requiring Docker.
