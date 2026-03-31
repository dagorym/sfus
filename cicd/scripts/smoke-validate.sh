#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
compose_file="${repo_root}/cicd/docker/compose.dev.yml"
root_env_example="${repo_root}/.env.example"
root_env_file="${repo_root}/.env"
web_env_example="${repo_root}/apps/web/.env.example"
web_env_file="${repo_root}/apps/web/.env"
api_env_example="${repo_root}/apps/api/.env.example"
api_env_file="${repo_root}/apps/api/.env"
project_name="sfus-smoke-${USER:-copilot}-$$"
docker_buildkit="${DOCKER_BUILDKIT:-0}"
port_seed="$((10000 + ($$ % 40000)))"

created_runtime_env_files=()

cleanup() {
  DOCKER_BUILDKIT="${docker_buildkit}" \
  WEB_HOST_PORT="${web_host_port:-3000}" \
  API_HOST_PORT="${api_host_port:-3001}" \
  MYSQL_HOST_PORT="${mysql_host_port:-3306}" \
  docker compose --env-file "${root_env_file}" -p "${project_name}" -f "${compose_file}" --profile fullstack down -v --remove-orphans >/dev/null 2>&1 || true

  for created_file in "${created_runtime_env_files[@]:-}"; do
    [[ -n "${created_file}" ]] || continue
    rm -f "${created_file}"
  done
}

trap cleanup EXIT

ensure_command() {
  local command_name="$1"

  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Error: required command not found: ${command_name}" >&2
    exit 1
  fi
}

ensure_runtime_env_file() {
  local target="$1"
  local source="$2"

  if [[ -f "${target}" ]]; then
    return 0
  fi

  cp "${source}" "${target}"
  created_runtime_env_files+=("${target}")
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

find_available_port() {
  local start_port="$1"
  local label="$2"
  local port

  for ((port = start_port; port <= 65535; port += 1)); do
    if port_is_available "${port}"; then
      printf '%s' "${port}"
      return 0
    fi
  done

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
ensure_command node
ensure_command npx
ensure_command python

cd "${repo_root}" || exit 1

echo "==> [build] Building frontend and API workspaces"
npx --yes pnpm@10.0.0 build

ensure_runtime_env_file "${root_env_file}" "${root_env_example}"
ensure_runtime_env_file "${web_env_file}" "${web_env_example}"
ensure_runtime_env_file "${api_env_file}" "${api_env_example}"

web_host_port="${WEB_HOST_PORT:-$(find_available_port "${port_seed}" "web")}"
api_host_port="${API_HOST_PORT:-$(find_available_port "$((web_host_port + 1))" "api")}"
mysql_host_port="${MYSQL_HOST_PORT:-$(find_available_port "$((api_host_port + 1))" "mysql")}"

echo "==> [startup] Starting Compose-managed full-stack validation runtime"
DOCKER_BUILDKIT="${docker_buildkit}" \
WEB_HOST_PORT="${web_host_port}" \
API_HOST_PORT="${api_host_port}" \
MYSQL_HOST_PORT="${mysql_host_port}" \
docker compose --env-file "${root_env_file}" -p "${project_name}" -f "${compose_file}" --profile fullstack up -d --build

echo "==> [startup] Waiting for homepage and API liveness"
wait_for_http_ok "http://127.0.0.1:${web_host_port}/" "homepage"
wait_for_http_ok "http://127.0.0.1:${api_host_port}/api/health/live" "API liveness"

echo "==> [migration] Running explicit migration command"
DOCKER_BUILDKIT="${docker_buildkit}" \
WEB_HOST_PORT="${web_host_port}" \
API_HOST_PORT="${api_host_port}" \
MYSQL_HOST_PORT="${mysql_host_port}" \
docker compose --env-file "${root_env_file}" -p "${project_name}" -f "${compose_file}" --profile fullstack run --rm api node dist/index.js migration:run

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
