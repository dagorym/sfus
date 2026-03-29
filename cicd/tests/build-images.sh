#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
runner="${repo_root}/cicd/scripts/build-images.sh"
scratch_dir="${script_dir}/.scratch-build-images"

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

assert_file_contains_literal() {
  local path="$1"
  local expected="$2"
  local message="$3"

  grep -Fq "${expected}" "${path}" || fail "${message}"
}

write_config() {
  local path="$1"
  local contents="$2"

  cat <<EOF_CONFIG >"${path}"
${contents}
EOF_CONFIG
}

mkdir -p "${scratch_dir}/fake-bin" "${scratch_dir}/context-api" "${scratch_dir}/context-worker" "${scratch_dir}/empty-bin"

cat <<'EOF_DOCKER' > "${scratch_dir}/fake-bin/docker"
#!/usr/bin/env bash
set -euo pipefail

echo "$*" >> "${TEST_DOCKER_LOG}"
exit "${TEST_DOCKER_EXIT_CODE:-0}"
EOF_DOCKER
chmod +x "${scratch_dir}/fake-bin/docker"

cat <<'EOF_DOCKERFILE' > "${scratch_dir}/context-api/Dockerfile.api"
FROM scratch
EOF_DOCKERFILE

cat <<'EOF_DOCKERFILE' > "${scratch_dir}/context-worker/Dockerfile"
FROM scratch
EOF_DOCKERFILE

build_config="${scratch_dir}/images.yml"
write_config "${build_config}" "version: 1
images:
  - id: api
    context: ${scratch_dir}/context-api
    dockerfile: ${scratch_dir}/context-api/Dockerfile.api
    image: ghcr.io/example/api
    tag: ghcr.io/example/api:test
  - name: worker
    context: ${scratch_dir}/context-worker
    dockerfile: ${scratch_dir}/context-worker/Dockerfile
    tag: worker:ci"

docker_log="${scratch_dir}/docker.log"
: > "${docker_log}"

echo "Checking configured image builds..."
run_capture configured-build env PATH="${scratch_dir}/fake-bin:${PATH}" TEST_DOCKER_LOG="${docker_log}" /usr/bin/bash "${runner}" "${build_config}"
assert_status 0
assert_stdout_contains '^Build summary: total=2; built=2; failures=0$' \
  "Expected configured image matrix to build both images successfully."
assert_stdout_contains '^==> \[api\] Building ghcr.io/example/api:test$' \
  "Expected first image id/tag output."
assert_stdout_contains '^==> \[worker\] Building worker:ci$' \
  "Expected second image name/tag output."
assert_file_contains_literal "${docker_log}" "build -f ${scratch_dir}/context-api/Dockerfile.api -t ghcr.io/example/api:test ${scratch_dir}/context-api" \
  "Expected docker build command for api image."
assert_file_contains_literal "${docker_log}" "build -f ${scratch_dir}/context-worker/Dockerfile -t worker:ci ${scratch_dir}/context-worker" \
  "Expected docker build command for worker image."

echo "Checking empty matrix warning-only behavior..."
empty_config="${scratch_dir}/empty-images.yml"
write_config "${empty_config}" "version: 1
images: []"
run_capture empty-matrix /usr/bin/bash "${runner}" "${empty_config}"
assert_status 0
assert_stderr_contains '^Warning: no images defined in .*empty-images\.yml$' \
  "Expected empty image matrix to emit warning and exit successfully."

echo "Checking docker-unavailable failure behavior..."
run_capture missing-docker env PATH="${scratch_dir}/empty-bin" /usr/bin/bash "${runner}" "${build_config}"
assert_nonzero_status
assert_stderr_contains '^Error: docker command not found but 2 image build\(s\) are configured\.$' \
  "Expected configured images to fail when docker is unavailable."

echo "PASS: Image build runner coverage succeeded."
