#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
runner="${repo_root}/cicd/scripts/run-containers.sh"
scratch_dir="${script_dir}/.scratch-run-containers"

cleanup() {
  rm -rf "${scratch_dir}"
}

trap cleanup EXIT

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

run_capture() {
  local name="$1"
  shift

  last_stdout="${scratch_dir}/${name}.stdout"
  last_stderr="${scratch_dir}/${name}.stderr"

  set +e
  "$@" >"${last_stdout}" 2>"${last_stderr}"
  last_status=$?
  set -e
}

assert_status() {
  local expected="$1"

  [[ "${last_status}" -eq "${expected}" ]] || fail "Expected exit code ${expected}, got ${last_status}"
}

assert_nonzero_status() {
  [[ "${last_status}" -ne 0 ]] || fail "Expected command to fail, but it succeeded"
}

assert_stderr_contains() {
  local pattern="$1"
  local message="$2"

  grep -Eq "${pattern}" "${last_stderr}" || fail "${message}"
}

write_file() {
  local path="$1"
  local contents="$2"

  cat <<EOF_FILE >"${path}"
${contents}
EOF_FILE
}

mkdir -p "${scratch_dir}" "${scratch_dir}/minimal-bin"

echo "Checking default no-service behavior..."
run_capture default /usr/bin/bash "${runner}"
assert_status 0
assert_stderr_contains '^Warning: no services are defined in .*/cicd/docker/compose\.dev\.yml; nothing to run\.$' \
  "Expected default run to warn and exit successfully when no services are defined."

echo "Checking no-service status action..."
run_capture status /usr/bin/bash "${runner}" status
assert_status 0
assert_stderr_contains '^Warning: no services are defined in .*/cicd/docker/compose\.dev\.yml; nothing to run\.$' \
  "Expected status action to warn and exit successfully when no services are defined."

echo "Checking supported action aliases with no-service compose..."
for action in start up run stop down status ps logs; do
  run_capture "action-${action}" /usr/bin/bash "${runner}" "${action}"
  assert_status 0
  assert_stderr_contains '^Warning: no services are defined in .*/cicd/docker/compose\.dev\.yml; nothing to run\.$' \
    "Expected action '${action}' to be accepted and no-op when no services are defined."
done

echo "Checking custom compose path behavior..."
custom_compose="${scratch_dir}/compose.custom.yml"
write_file "${custom_compose}" 'version: "3.9"
services: {}'
run_capture custom-compose /usr/bin/bash "${runner}" "${custom_compose}" start
assert_status 0
assert_stderr_contains "^Warning: no services are defined in ${custom_compose//\//\/}; nothing to run\\.$" \
  "Expected custom compose file to warn and exit successfully when no services are defined."

echo "Checking missing compose file handling..."
run_capture missing-compose /usr/bin/bash "${runner}" "${scratch_dir}/does-not-exist.yml"
assert_nonzero_status
assert_stderr_contains '^Compose file not found: .*/does-not-exist\.yml$' \
  "Expected missing compose file to fail with a not-found error."

echo "Checking docker requirement when services exist..."
service_compose="${scratch_dir}/compose.with-service.yml"
write_file "${service_compose}" 'version: "3.9"
services:
  app:
    image: busybox'
ln -sf /usr/bin/awk "${scratch_dir}/minimal-bin/awk"
ln -sf /usr/bin/dirname "${scratch_dir}/minimal-bin/dirname"
run_capture missing-docker env PATH="${scratch_dir}/minimal-bin" /usr/bin/bash "${runner}" "${service_compose}" status
assert_nonzero_status
assert_stderr_contains "^Error: docker compose is required but neither 'docker compose' nor 'docker-compose' is available\\.$" \
  "Expected configured services to fail when docker compose is unavailable."

echo "Checking inline-map services detection..."
inline_service_compose="${scratch_dir}/compose.inline-service.yml"
write_file "${inline_service_compose}" 'version: "3.9"
services: {app: {image: busybox}}'
run_capture inline-services env PATH="${scratch_dir}/minimal-bin" /usr/bin/bash "${runner}" "${inline_service_compose}" status
assert_nonzero_status
assert_stderr_contains "^Error: docker compose is required but neither 'docker compose' nor 'docker-compose' is available\\.$" \
  "Expected inline-map services to be detected as configured services."

echo "Checking non-fixed service indentation detection..."
indented_service_compose="${scratch_dir}/compose.indented-service.yml"
write_file "${indented_service_compose}" 'version: "3.9"
services:
    app:
      image: busybox'
run_capture indented-services env PATH="${scratch_dir}/minimal-bin" /usr/bin/bash "${runner}" "${indented_service_compose}" status
assert_nonzero_status
assert_stderr_contains "^Error: docker compose is required but neither 'docker compose' nor 'docker-compose' is available\\.$" \
  "Expected block-style services with 4-space indentation to be detected as configured services."

echo "PASS: Container runner coverage succeeded."
