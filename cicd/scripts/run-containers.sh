#!/usr/bin/env bash

set -u -o pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
default_compose_file="${repo_root}/cicd/docker/compose.dev.yml"
compose_file="$default_compose_file"
action="start"

is_action() {
  case "$1" in
    start|up|run|stop|down|status|ps|logs)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

if (( $# >= 1 )); then
  if is_action "$1"; then
    action="$1"
    shift
  else
    compose_file="$1"
    shift
  fi
fi

if (( $# >= 1 )) && is_action "$1"; then
  action="$1"
  shift
fi

find_service_count() {
  local file="$1"

  awk '
    function indent_of(line,    m) {
      match(line, /^[[:space:]]*/)
      return RLENGTH
    }

    /^[[:space:]]*services:[[:space:]]*/ {
      services_indent = indent_of($0)
      inline_services = $0
      sub(/^[[:space:]]*services:[[:space:]]*/, "", inline_services)
      gsub(/[[:space:]]/, "", inline_services)
      if (inline_services == "{}") {
        in_services = 0
        next
      }
      if (inline_services ~ /^\{.+\}$/) {
        count += 1
        in_services = 0
        next
      }
      in_services = 1
      child_indent = -1
      next
    }

    in_services {
      line_indent = indent_of($0)
      if ($0 ~ /^[[:space:]]*$/ || $0 ~ /^[[:space:]]*#/) {
        next
      }
      if (line_indent <= services_indent) {
        in_services = 0
        next
      }
      if ($0 !~ /^[[:space:]]*[A-Za-z0-9_.-]+:[[:space:]]*/) {
        next
      }
      if (child_indent == -1) {
        child_indent = line_indent
      }
      if (line_indent == child_indent) {
        count += 1
      }
    }

    END { print count+0 }
  ' "$file"
}

if [[ ! -f "$compose_file" ]]; then
  echo "Compose file not found: $compose_file" >&2
  exit 1
fi

service_count="$(find_service_count "$compose_file")"
if [[ "$service_count" == "0" ]]; then
  echo "Warning: no services are defined in $compose_file; nothing to run." >&2
  exit 0
fi

if command -v docker >/dev/null 2>&1; then
  compose_cmd=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  compose_cmd=(docker-compose)
else
  echo "Error: docker compose is required but neither 'docker compose' nor 'docker-compose' is available." >&2
  exit 1
fi

cd "$repo_root" || exit 1

case "$action" in
  start|up)
    extra_args="${*:-}"
    echo "Running: ${compose_cmd[*]} -f $compose_file up -d ${extra_args}"
    "${compose_cmd[@]}" -f "$compose_file" up -d "$@"
    ;;
  run)
    extra_args="${*:-}"
    echo "Running: ${compose_cmd[*]} -f $compose_file up ${extra_args}"
    "${compose_cmd[@]}" -f "$compose_file" up "$@"
    ;;
  stop|down)
    echo "Running: ${compose_cmd[*]} -f $compose_file down"
    "${compose_cmd[@]}" -f "$compose_file" down
    ;;
  status|ps)
    echo "Running: ${compose_cmd[*]} -f $compose_file ps"
    "${compose_cmd[@]}" -f "$compose_file" ps
    ;;
  logs)
    extra_args="${*:-}"
    echo "Running: ${compose_cmd[*]} -f $compose_file logs ${extra_args}"
    "${compose_cmd[@]}" -f "$compose_file" logs "$@"
    ;;
  *)
    echo "Unsupported action '$action'." >&2
    echo "Usage: bash cicd/scripts/run-containers.sh [compose-file] [start|run|stop|status|logs] [extra docker compose args...]" >&2
    exit 1
    ;;
esac
