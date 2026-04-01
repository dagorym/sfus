#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
compose_file="${repo_root}/cicd/docker/compose.dev.yml"
root_env_example="${repo_root}/.env.example"
web_env_example="${repo_root}/apps/web/.env.example"
api_env_example="${repo_root}/apps/api/.env.example"
project_name="sfus-smoke-${USER:-copilot}-$$"
docker_buildkit="${DOCKER_BUILDKIT:-0}"
port_seed="$((10000 + ($$ % 40000)))"
reserved_port_files=()

cleanup() {
  DOCKER_BUILDKIT="${docker_buildkit}" \
  WEB_HOST_PORT="${web_host_port:-3000}" \
  API_HOST_PORT="${api_host_port:-3001}" \
  MYSQL_HOST_PORT="${mysql_host_port:-3306}" \
  docker compose --env-file "${runtime_root_env_file}" -p "${project_name}" -f "${runtime_compose_file}" --profile fullstack down -v --remove-orphans >/dev/null 2>&1 || true

  for reserved_port_file in "${reserved_port_files[@]:-}"; do
    [[ -n "${reserved_port_file}" ]] || continue
    rm -f "${reserved_port_file}"
  done

  rm -rf "${runtime_dir}" "${runtime_compose_file}"
}

trap cleanup EXIT

ensure_command() {
  local command_name="$1"

  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Error: required command not found: ${command_name}" >&2
    exit 1
  fi
}

copy_runtime_env_file() {
  local target="$1"
  local preferred_source="$2"
  local fallback_source="$3"
  local source="${fallback_source}"

  if [[ -f "${preferred_source}" ]]; then
    source="${preferred_source}"
  fi

  cp "${source}" "${target}"
}

render_runtime_compose_file() {
  python - "${compose_file}" "${runtime_compose_file}" "${runtime_web_env_file}" "${runtime_api_env_file}" "${repo_root}" <<'PY'
from pathlib import Path
import sys

source_path = Path(sys.argv[1])
target_path = Path(sys.argv[2])
web_env = Path(sys.argv[3]).resolve()
api_env = Path(sys.argv[4]).resolve()
repo_root = Path(sys.argv[5]).resolve()

content = source_path.read_text()
content = content.replace("- ../../apps/web/.env", f"- {web_env}")
content = content.replace("- ../../apps/api/.env", f"- {api_env}")
content = content.replace("context: ../..", f"context: {repo_root}")
content = content.replace("dockerfile: apps/api/Dockerfile", f"dockerfile: {repo_root / 'apps/api/Dockerfile'}")
content = content.replace("dockerfile: apps/web/Dockerfile", f"dockerfile: {repo_root / 'apps/web/Dockerfile'}")
target_path.write_text(content)
PY
}

release_stale_port_reservation() {
  local reservation_file="$1"
  local owner_pid

  owner_pid="$(<"${reservation_file}")"
  if [[ -z "${owner_pid}" ]] || ! kill -0 "${owner_pid}" >/dev/null 2>&1; then
    rm -f "${reservation_file}"
  fi
}

wait_for_http_ok() {
  local url="$1"
  local label="$2"
  local attempts="${3:-60}"
  local delay_seconds="${4:-2}"

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if curl -fsS "${url}" >/dev/null; then
      return 0
    fi

    sleep "${delay_seconds}"
  done

  echo "Error: timed out waiting for ${label} at ${url}" >&2
  exit 1
}

port_is_available() {
  local port="$1"

  if python - "$port" <<'PY'
import socket
import sys

port = int(sys.argv[1])
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind(("127.0.0.1", port))
    except OSError:
        sys.exit(1)
sys.exit(0)
PY
  then
    return 0
  fi

  return 1
}

reserve_available_port() {
  local result_var="$1"
  local start_port="$2"
  local label="$3"
  local port
  local reservation_file

  exec 9>"${port_reservation_lock}"
  flock 9
  for ((port = start_port; port <= 65535; port += 1)); do
    reservation_file="${port_reservation_dir}/${port}"

    if [[ -f "${reservation_file}" ]]; then
      release_stale_port_reservation "${reservation_file}"
    fi

    if [[ -f "${reservation_file}" ]]; then
      continue
    fi

    if port_is_available "${port}"; then
      printf '%s\n' "$$" >"${reservation_file}"
      reserved_port_files+=("${reservation_file}")
      flock -u 9
      printf -v "${result_var}" '%s' "${port}"
      return 0
    fi
  done

  flock -u 9

  echo "Error: could not find an available host port for ${label} starting at ${start_port}" >&2
  exit 1
}

assert_output_contains() {
  local output="$1"
  local pattern="$2"
  local message="$3"

  if ! grep -Eq "${pattern}" <<<"${output}"; then
    echo "Error: ${message}" >&2
    exit 1
  fi
}

ensure_command docker
ensure_command curl
ensure_command flock
ensure_command git
ensure_command python

cd "${repo_root}" || exit 1

runtime_artifact_root="$(git rev-parse --git-path smoke-validate)"
port_reservation_dir="${runtime_artifact_root}/port-reservations"
port_reservation_lock="${runtime_artifact_root}/port-reservations.lock"
runtime_dir="${runtime_artifact_root}/${project_name}"
runtime_compose_file="${runtime_dir}/compose.yml"
runtime_root_env_file="${runtime_dir}/root.env"
runtime_web_env_file="${runtime_dir}/web.env"
runtime_api_env_file="${runtime_dir}/api.env"

mkdir -p "${runtime_dir}" "${port_reservation_dir}"

copy_runtime_env_file "${runtime_root_env_file}" "${repo_root}/.env" "${root_env_example}"
copy_runtime_env_file "${runtime_web_env_file}" "${repo_root}/apps/web/.env" "${web_env_example}"
copy_runtime_env_file "${runtime_api_env_file}" "${repo_root}/apps/api/.env" "${api_env_example}"
render_runtime_compose_file

if [[ -n "${WEB_HOST_PORT:-}" ]]; then
  web_host_port="${WEB_HOST_PORT}"
else
  reserve_available_port web_host_port "${port_seed}" "web"
fi

if [[ -n "${API_HOST_PORT:-}" ]]; then
  api_host_port="${API_HOST_PORT}"
else
  reserve_available_port api_host_port "$((port_seed + 1))" "api"
fi

if [[ -n "${MYSQL_HOST_PORT:-}" ]]; then
  mysql_host_port="${MYSQL_HOST_PORT}"
else
  reserve_available_port mysql_host_port "$((port_seed + 2))" "mysql"
fi

echo "==> [build] Building full-stack validation images"
DOCKER_BUILDKIT="${docker_buildkit}" \
WEB_HOST_PORT="${web_host_port}" \
API_HOST_PORT="${api_host_port}" \
MYSQL_HOST_PORT="${mysql_host_port}" \
docker compose --env-file "${runtime_root_env_file}" -p "${project_name}" -f "${runtime_compose_file}" --profile fullstack build web api

echo "==> [startup] Starting Compose-managed full-stack validation runtime"
DOCKER_BUILDKIT="${docker_buildkit}" \
WEB_HOST_PORT="${web_host_port}" \
API_HOST_PORT="${api_host_port}" \
MYSQL_HOST_PORT="${mysql_host_port}" \
docker compose --env-file "${runtime_root_env_file}" -p "${project_name}" -f "${runtime_compose_file}" --profile fullstack up -d

echo "==> [startup] Waiting for homepage and API liveness"
wait_for_http_ok "http://127.0.0.1:${web_host_port}/" "homepage"
wait_for_http_ok "http://127.0.0.1:${api_host_port}/api/health/live" "API liveness"

echo "==> [migration] Running explicit migration command"
DOCKER_BUILDKIT="${docker_buildkit}" \
WEB_HOST_PORT="${web_host_port}" \
API_HOST_PORT="${api_host_port}" \
MYSQL_HOST_PORT="${mysql_host_port}" \
docker compose --env-file "${runtime_root_env_file}" -p "${project_name}" -f "${runtime_compose_file}" --profile fullstack run --rm api node dist/index.js migration:run

echo "==> [validation] Verifying homepage contract"
homepage_response="$(curl -fsS "http://127.0.0.1:${web_host_port}/")"
assert_output_contains "${homepage_response}" 'Star Frontiers|starfrontiers\.us' \
  "homepage response did not include the expected SFUS branding."

echo "==> [validation] Verifying API health contracts"
api_live_response="$(curl -fsS "http://127.0.0.1:${api_host_port}/api/health/live")"
assert_output_contains "${api_live_response}" '"status"[[:space:]]*:[[:space:]]*"ok"' \
  "API liveness response did not report ok status."
assert_output_contains "${api_live_response}" '"service"[[:space:]]*:[[:space:]]*"api"' \
  "API liveness response did not identify the api service."

wait_for_http_ok "http://127.0.0.1:${api_host_port}/api/health/ready" "API readiness"
api_ready_response="$(curl -fsS "http://127.0.0.1:${api_host_port}/api/health/ready")"
assert_output_contains "${api_ready_response}" '"status"[[:space:]]*:[[:space:]]*"ok"' \
  "API readiness response did not report ok status after migrations ran."
assert_output_contains "${api_ready_response}" '"migrations"' \
  "API readiness response did not include migration status details."

echo ""
echo "Smoke validation succeeded for build, startup, migration execution, homepage reachability, and API health."
