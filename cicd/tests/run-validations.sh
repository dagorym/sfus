#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
runner="${repo_root}/cicd/scripts/run-validations.sh"
validation_config="${repo_root}/cicd/config/validation-config.yml"
image_matrix="${repo_root}/cicd/config/image-matrix.yml"
cd_workflow="${repo_root}/.github/workflows/cd.yml"
compose_dev="${repo_root}/cicd/docker/compose.dev.yml"
compose_prod="${repo_root}/cicd/docker/compose.prod.yml"
root_env_example="${repo_root}/.env.example"
web_env_example="${repo_root}/apps/web/.env.example"
api_env_example="${repo_root}/apps/api/.env.example"
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

assert_stderr_not_contains() {
  local pattern="$1"
  local message="$2"

  if grep -Eq "${pattern}" "${last_stderr}"; then
    fail "${message}"
  fi
}

assert_service_has_no_ports() {
  local path="$1"
  local service="$2"
  local message="$3"

  if ! awk -v svc="${service}" '
    function indent_of(line,    m) {
      match(line, /^[[:space:]]*/)
      return RLENGTH
    }

    $0 ~ ("^[[:space:]]{2}" svc ":[[:space:]]*$") {
      in_service = 1
      service_indent = indent_of($0)
      next
    }

    in_service {
      if ($0 ~ /^[[:space:]]*$/ || $0 ~ /^[[:space:]]*#/) {
        next
      }

      line_indent = indent_of($0)
      if (line_indent <= service_indent) {
        in_service = 0
      } else if ($0 ~ /^[[:space:]]+ports:[[:space:]]*$/) {
        found_ports = 1
        exit 1
      }
    }

    END {
      if (found_ports) {
        exit 1
      }
    }
  ' "${path}"; then
    fail "${message}"
  fi
}

assert_file_contains_literal() {
  local path="$1"
  local expected="$2"
  local message="$3"

  grep -Fq "${expected}" "${path}" || fail "${message}"
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

assert_stdout_not_contains() {
  local pattern="$1"
  local message="$2"

  if grep -Eq "${pattern}" "${last_stdout}"; then
    fail "${message}"
  fi
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

assert_workflow_cicd_paths_limited() {
  local path="$1"
  local references

  references="$(grep -oE 'cicd/[A-Za-z0-9._/-]+' "${path}" | sort -u || true)"
  [[ -n "${references}" ]] || fail "Expected workflow to reference cicd assets."

  while IFS= read -r ref; do
    [[ -z "${ref}" ]] && continue
    if [[ ! "${ref}" =~ ^cicd/(scripts|config)/ ]]; then
      fail "Workflow references disallowed cicd path: ${ref}"
    fi
  done <<< "${references}"
}

mkdir -p "${scratch_dir}"

echo "Checking Milestone 1 Subtask 2 runtime contract artifacts..."
assert_file_exists "${root_env_example}"
assert_file_contains "${root_env_example}" '^#[[:space:]]*Ownership:[[:space:]]*platform/deployment\.[[:space:]]*$' \
  "Expected root env example to document platform/deployment ownership."
assert_file_contains "${root_env_example}" '^SFUS_PUBLIC_HOST=' \
  "Expected root env example to include SFUS_PUBLIC_HOST."
assert_file_contains "${root_env_example}" '^LETSENCRYPT_EMAIL=' \
  "Expected root env example to include LETSENCRYPT_EMAIL."
assert_file_contains "${root_env_example}" '^MYSQL_ROOT_PASSWORD=' \
  "Expected root env example to include MYSQL_ROOT_PASSWORD."
assert_file_contains "${root_env_example}" '^MYSQL_DATABASE=' \
  "Expected root env example to include MYSQL_DATABASE."
assert_file_contains "${root_env_example}" '^MYSQL_USER=' \
  "Expected root env example to include MYSQL_USER."
assert_file_contains "${root_env_example}" '^MYSQL_PASSWORD=' \
  "Expected root env example to include MYSQL_PASSWORD."

assert_file_exists "${web_env_example}"
assert_file_contains "${web_env_example}" '^#[[:space:]]*Ownership:[[:space:]]*web application\.[[:space:]]*$' \
  "Expected web env example to document web ownership."
assert_file_contains "${web_env_example}" '^NEXT_PUBLIC_API_BASE_PATH=/api$' \
  "Expected web env example to define NEXT_PUBLIC_API_BASE_PATH=/api."
assert_file_contains "${web_env_example}" '^WEB_API_INTERNAL_URL=http://api:3001$' \
  "Expected web env example to define internal api service URL."

assert_file_exists "${api_env_example}"
assert_file_contains "${api_env_example}" '^#[[:space:]]*Ownership:[[:space:]]*API application\.[[:space:]]*$' \
  "Expected API env example to document API ownership."
assert_file_contains "${api_env_example}" '^DB_HOST=mysql$' \
  "Expected API env example to use mysql service naming."
assert_file_contains "${api_env_example}" '^DB_PORT=3306$' \
  "Expected API env example to define DB_PORT=3306."

assert_file_exists "${compose_dev}"
assert_file_contains "${compose_dev}" '^[[:space:]]{2}mysql:[[:space:]]*$' \
  "Expected local compose to define mysql service."
assert_file_contains "${compose_dev}" '^[[:space:]]{2}api:[[:space:]]*$' \
  "Expected local compose to define api service."
assert_file_contains "${compose_dev}" '^[[:space:]]{2}web:[[:space:]]*$' \
  "Expected local compose to define web service."
assert_file_contains "${compose_dev}" 'DB_HOST:[[:space:]]*mysql$' \
  "Expected local compose api env override to use mysql hostname."
assert_file_contains "${compose_dev}" 'WEB_API_INTERNAL_URL:[[:space:]]*http://api:3001$' \
  "Expected local compose web env override to use api service URL."

assert_file_exists "${compose_prod}"
assert_file_contains "${compose_prod}" '^[[:space:]]{2}web:[[:space:]]*$' \
  "Expected production compose to define web service."
assert_file_contains "${compose_prod}" '^[[:space:]]{2}api:[[:space:]]*$' \
  "Expected production compose to define api service."
assert_file_contains "${compose_prod}" '^[[:space:]]{2}migrate:[[:space:]]*$' \
  "Expected production compose to define explicit migrate service."
assert_file_contains "${compose_prod}" 'profiles:[[:space:]]*\["migration"\]' \
  "Expected migrate service to be gated behind migration profile."
assert_file_contains "${compose_prod}" 'command:[[:space:]]*\["node",[[:space:]]*"dist/index\.js",[[:space:]]*"migration:run"\]' \
  "Expected migrate service to run explicit migration command."
assert_file_contains_literal "${compose_prod}" 'VIRTUAL_HOST: ${SFUS_PUBLIC_HOST:?set in host env}' \
  "Expected production compose reverse-proxy VIRTUAL_HOST metadata."
assert_file_contains "${compose_prod}" 'VIRTUAL_PORT:[[:space:]]*"3000"' \
  "Expected production compose web VIRTUAL_PORT metadata."
assert_file_contains "${compose_prod}" 'VIRTUAL_PATH:[[:space:]]*/api' \
  "Expected production compose api VIRTUAL_PATH metadata."
assert_file_contains_literal "${compose_prod}" 'LETSENCRYPT_HOST: ${SFUS_PUBLIC_HOST:?set in host env}' \
  "Expected production compose LetsEncrypt host metadata."
assert_file_contains_literal "${compose_prod}" 'LETSENCRYPT_EMAIL: ${LETSENCRYPT_EMAIL:?set in host env}' \
  "Expected production compose LetsEncrypt email metadata."
assert_service_has_no_ports "${compose_prod}" 'web' \
  "Did not expect host port bindings under production web service."
assert_service_has_no_ports "${compose_prod}" 'api' \
  "Did not expect host port bindings under production api service."

echo "Checking shared config contracts..."
workflow_file="${repo_root}/.github/workflows/ci.yml"
assert_file_exists "${workflow_file}"
assert_file_contains "${workflow_file}" '^[[:space:]]*name:[[:space:]]*CI[[:space:]]*$' \
  "Expected .github/workflows/ci.yml to define the CI workflow."
assert_file_contains "${workflow_file}" '^[[:space:]]*push:[[:space:]]*$' \
  "Expected CI workflow to trigger on push."
assert_file_contains "${workflow_file}" '^[[:space:]]*pull_request:[[:space:]]*$' \
  "Expected CI workflow to trigger on pull requests."
assert_file_contains "${workflow_file}" '^[[:space:]]*workflow_dispatch:[[:space:]]*$' \
  "Expected CI workflow to support manual dispatch."
assert_file_contains "${workflow_file}" '^[[:space:]]*-[[:space:]]main[[:space:]]*$' \
  "Expected CI workflow push/PR trigger branch to include main."
assert_file_contains "${workflow_file}" '^[[:space:]]*run:[[:space:]]*bash cicd/scripts/run-validations\.sh cicd/config/validation-config\.yml[[:space:]]*$' \
  "Expected CI workflow to invoke the shared validation runner with shared config."
assert_workflow_cicd_paths_limited "${workflow_file}"

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
assert_file_contains "${image_matrix}" '^[[:space:]]*publish_enabled:[[:space:]]*false[[:space:]]*$' \
  "Expected cicd/config/image-matrix.yml to gate publish by default."
assert_file_contains "${image_matrix}" '^[[:space:]]*deploy_enabled:[[:space:]]*false[[:space:]]*$' \
  "Expected cicd/config/image-matrix.yml to gate deploy by default."

assert_file_exists "${cd_workflow}"
assert_file_contains "${cd_workflow}" '^[[:space:]]*workflow_dispatch:[[:space:]]*$' \
  "Expected CD workflow to be manually triggerable."
assert_file_contains "${cd_workflow}" '^[[:space:]]*git_ref:[[:space:]]*$' \
  "Expected CD workflow to define git_ref input."
assert_file_contains "${cd_workflow}" '^[[:space:]]*run_publish:[[:space:]]*$' \
  "Expected CD workflow to define run_publish input."
assert_file_contains "${cd_workflow}" '^[[:space:]]*run_deploy:[[:space:]]*$' \
  "Expected CD workflow to define run_deploy input."
assert_file_contains "${cd_workflow}" '^[[:space:]]*default:[[:space:]]*false[[:space:]]*$' \
  "Expected CD workflow boolean stage gates to remain disabled by default."
assert_file_contains "${cd_workflow}" '^[[:space:]]*dockerhub_namespace:[[:space:]]*$' \
  "Expected CD workflow to define dockerhub_namespace input for future publish."
assert_file_contains "${cd_workflow}" '^[[:space:]]*dockerhub_repository_prefix:[[:space:]]*$' \
  "Expected CD workflow to define dockerhub_repository_prefix input for future publish."
assert_file_not_contains "${cd_workflow}" '^[[:space:]]*push:[[:space:]]*$' \
  "Did not expect CD workflow to include push trigger."
assert_file_not_contains "${cd_workflow}" '^[[:space:]]*pull_request:[[:space:]]*$' \
  "Did not expect CD workflow to include pull_request trigger."
assert_file_contains_literal "${cd_workflow}" "if: \${{ inputs.run_publish == true }}" \
  "Expected publish job to be gated by run_publish input."
assert_file_contains_literal "${cd_workflow}" "if: \${{ inputs.run_deploy == true }}" \
  "Expected deploy job to be gated by run_deploy input."
assert_file_contains_literal "${cd_workflow}" "DOCKERHUB_USERNAME: \${{ secrets.DOCKERHUB_USERNAME }}" \
  "Expected publish placeholder to document DOCKERHUB_USERNAME secret contract."
assert_file_contains_literal "${cd_workflow}" "DOCKERHUB_TOKEN: \${{ secrets.DOCKERHUB_TOKEN }}" \
  "Expected publish placeholder to document DOCKERHUB_TOKEN secret contract."
assert_file_contains_literal "${cd_workflow}" "DOCKERHUB_NAMESPACE: \${{ inputs.dockerhub_namespace }}" \
  "Expected publish placeholder to document dockerhub_namespace input contract."
assert_file_contains_literal "${cd_workflow}" "DOCKERHUB_REPOSITORY_PREFIX: \${{ inputs.dockerhub_repository_prefix }}" \
  "Expected publish placeholder to document dockerhub_repository_prefix input contract."
assert_file_contains_literal "${cd_workflow}" "IMAGE_MATRIX_PATH: cicd/config/image-matrix.yml" \
  "Expected publish placeholder to document image matrix source-of-truth path."
assert_file_not_contains "${cd_workflow}" 'docker/login-action' \
  "Did not expect Docker Hub login to be enabled in the current publish placeholder."
assert_file_not_contains "${cd_workflow}" 'docker push' \
  "Did not expect the current publish placeholder to execute docker push."
assert_file_contains_literal "${cd_workflow}" "run: bash cicd/scripts/build-images.sh cicd/config/image-matrix.yml build" \
  "Expected build-images job to call shared script/config."
assert_file_contains_literal "${cd_workflow}" "run: bash cicd/scripts/build-images.sh cicd/config/image-matrix.yml publish" \
  "Expected publish job to call shared script/config."
assert_file_contains_literal "${cd_workflow}" "run: bash cicd/scripts/build-images.sh cicd/config/image-matrix.yml deploy" \
  "Expected deploy job to call shared script/config."

assert_file_contains "${image_matrix}" '^#[[:space:]]*- Source of truth for publish image naming remains this file'"'"'s images\[\]\.tag field\.$' \
  "Expected image matrix to document images[].tag as publish naming source of truth."
assert_file_contains "${image_matrix}" '^#[[:space:]]*- Future workflow input: dockerhub_namespace$' \
  "Expected image matrix to document dockerhub_namespace future input."
assert_file_contains "${image_matrix}" '^#[[:space:]]*- Future workflow input: dockerhub_repository_prefix \(optional\)$' \
  "Expected image matrix to document dockerhub_repository_prefix future input."
assert_file_contains "${image_matrix}" '^#[[:space:]]*- Future secrets: DOCKERHUB_USERNAME and DOCKERHUB_TOKEN$' \
  "Expected image matrix to document future Docker Hub secret names."
assert_file_contains "${image_matrix}" '^#[[:space:]]*- Future login location: \.github/workflows/cd\.yml publish job before invoking publish logic\.$' \
  "Expected image matrix to document intended Docker Hub login location."

echo "Checking CD workflow only references shared cicd/scripts and cicd/config assets..."
while IFS= read -r cicd_asset; do
  [[ -z "${cicd_asset}" ]] && continue
  if [[ ! "${cicd_asset}" =~ ^cicd/(scripts|config)/ ]]; then
    fail "Expected CD workflow to reference only cicd/scripts or cicd/config assets, found: ${cicd_asset}"
  fi
done < <(grep -oE 'cicd/[[:alnum:]_./-]+' "${cd_workflow}" | sort -u)

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
assert_stderr_not_contains "^::warning::" \
  "Did not expect GitHub annotation when GITHUB_ACTIONS is unset."
assert_stdout_not_contains "^::warning::" \
  "Did not expect GitHub annotation when GITHUB_ACTIONS is unset."
assert_stdout_contains '^Completed with warnings only\.$' \
  "Expected warning-only config to complete successfully."

echo "Running warning-only config under GitHub Actions..."
run_capture warning-only-actions env GITHUB_ACTIONS=true bash "${runner}" "${warning_only_config}"
assert_status 0
assert_stderr_contains "Warning: validation 'warning-only' has no command configured; skipping\\." \
  "Expected warning text to remain in stderr when running in Actions."
assert_stderr_not_contains "^::warning::" \
  "Did not expect GitHub annotation token on stderr when running in Actions."
assert_stdout_contains "^::warning::validation 'warning-only' has no command configured; skipping\\.$" \
  "Expected GitHub Actions annotation on workflow-command output when running in Actions."
assert_stdout_contains '^Completed with warnings only\.$' \
  "Expected warning-only Actions run to complete successfully."

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

echo "Running image build runner tests..."
bash "${script_dir}/build-images.sh"

echo "Running container runner tests..."
bash "${script_dir}/run-containers.sh"

echo "PASS: Linux validation coverage succeeded."
