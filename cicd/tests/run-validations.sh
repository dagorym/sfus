#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
runner="${repo_root}/cicd/scripts/run-validations.sh"
validation_config="${repo_root}/cicd/config/validation-config.yml"
image_matrix="${repo_root}/cicd/config/image-matrix.yml"
scratch_dir="${script_dir}/.scratch"

cleanup() {
  rm -rf "${scratch_dir}"
}

trap cleanup EXIT

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

assert_file_exists() {
  local path="$1"

  [[ -f "${path}" ]] || fail "Expected file to exist: ${path}"
}

assert_file_contains() {
  local path="$1"
  local pattern="$2"
  local message="$3"

  grep -Eq "${pattern}" "${path}" || fail "${message}"
}

assert_file_not_contains() {
  local path="$1"
  local pattern="$2"
  local message="$3"

  if grep -Eq "${pattern}" "${path}"; then
    fail "${message}"
  fi
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

assert_stdout_contains() {
  local pattern="$1"
  local message="$2"

  grep -Eq "${pattern}" "${last_stdout}" || fail "${message}"
}

assert_stderr_contains() {
  local pattern="$1"
  local message="$2"

  grep -Eq "${pattern}" "${last_stderr}" || fail "${message}"
}

write_config() {
  local path="$1"
  local contents="$2"

  cat <<EOF >"${path}"
${contents}
EOF
}

mkdir -p "${scratch_dir}"

echo "Checking shared config contracts..."
assert_file_exists "${validation_config}"
assert_file_contains "${validation_config}" '^[[:space:]]*validations:[[:space:]]*$' \
  "Expected cicd/config/validation-config.yml to declare validations."
assert_file_contains "${validation_config}" '^[[:space:]]*command:[[:space:]]*' \
  "Expected cicd/config/validation-config.yml to use the Linux-only command field."
assert_file_not_contains "${validation_config}" '^[[:space:]]*commands:[[:space:]]*$' \
  "Did not expect legacy per-shell command blocks in cicd/config/validation-config.yml."

assert_file_exists "${image_matrix}"
assert_file_contains "${image_matrix}" '^[[:space:]]*images:[[:space:]]*\[[[:space:]]*\][[:space:]]*$' \
  "Expected cicd/config/image-matrix.yml to support an empty image list."

echo "Running default validation config..."
run_capture default-config bash "${runner}"
assert_status 0
assert_stdout_contains '^Validation summary: total=[0-9]+; executed=[0-9]+; warnings=[0-9]+; failures=0$' \
  "Expected default validation run to complete successfully."

echo "Running warning-only validation config..."
warning_only_config="${scratch_dir}/warning-only.yml"
write_config "${warning_only_config}" 'version: 1
warn_on_missing_command: true
validations:
  - id: warning-only
    description: Warning-only validation
    command: ""'
run_capture warning-only bash "${runner}" "${warning_only_config}"
assert_status 0
assert_stderr_contains "Warning: validation 'warning-only' has no command configured; skipping\\." \
  "Expected warning-only config to emit a missing-command warning."
assert_stdout_contains '^Completed with warnings only\.$' \
  "Expected warning-only config to complete successfully."

echo "Checking missing config handling..."
run_capture missing-config bash "${runner}" "${scratch_dir}/does-not-exist.yml"
if [[ "${last_status}" -eq 0 ]]; then
  fail "Expected missing config path to exit non-zero."
fi
assert_stderr_contains '^Validation config not found: .*does-not-exist\.yml$' \
  "Expected missing config path to report a not-found error."

echo "Checking strict missing-command handling..."
strict_config="${scratch_dir}/strict-missing-command.yml"
write_config "${strict_config}" 'version: 1
warn_on_missing_command: false
validations:
  - id: strict-missing-command
    description: Missing command should fail
    command: ""'
run_capture strict-missing-command bash "${runner}" "${strict_config}"
if [[ "${last_status}" -eq 0 ]]; then
  fail "Expected strict missing-command config to exit non-zero."
fi
assert_stderr_contains "Error: validation 'strict-missing-command' has no command configured\\." \
  "Expected strict missing-command config to fail."

echo "PASS: Linux validation coverage succeeded."
