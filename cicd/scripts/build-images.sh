#!/usr/bin/env bash

set -u -o pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
config_path="${1:-${repo_root}/cicd/config/image-matrix.yml}"
operation="${2:-build}"

case "$operation" in
  build|validation)
    ;;
  publish|deploy)
    echo "Warning: '$operation' mode is reserved for future CD stages and is gated off by default." >&2
    exit 0
    ;;
  *)
    echo "Error: unsupported build-images operation '$operation'. Supported values: build, validation, publish, deploy." >&2
    exit 1
    ;;
esac

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

parse_scalar() {
  local value
  value="$(trim "$1")"

  if [[ "$value" == "null" || "$value" == "~" ]]; then
    printf ''
    return
  fi

  if [[ ${#value} -ge 2 && "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
    value="${value:1:${#value}-2}"
    value="${value//\\\"/\"}"
    printf '%s' "$value"
    return
  fi

  if [[ ${#value} -ge 2 && "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
    value="${value:1:${#value}-2}"
    printf '%s' "$value"
    return
  fi

  printf '%s' "$value"
}

set_image_key() {
  local index="$1"
  local key="$2"
  local raw_value="$3"
  local value
  value="$(parse_scalar "$raw_value")"

  case "$key" in
    id)
      ids[$index]="$value"
      ;;
    name)
      if [[ -z "${ids[$index]}" ]]; then
        ids[$index]="$value"
      fi
      ;;
    context)
      contexts[$index]="$value"
      ;;
    dockerfile)
      dockerfiles[$index]="$value"
      ;;
    image)
      image_names[$index]="$value"
      ;;
    tag)
      tags[$index]="$value"
      ;;
  esac
}

if [[ ! -f "$config_path" ]]; then
  echo "Image matrix not found: $config_path" >&2
  exit 1
fi

cd "$repo_root" || exit 1

declare -a ids
declare -a contexts
declare -a dockerfiles
declare -a image_names
declare -a tags

current_index=-1

while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" =~ ^[[:space:]]*-[[:space:]]*([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]*:[[:space:]]*(.*)$ ]]; then
    ((current_index += 1))
    ids[$current_index]=""
    contexts[$current_index]="."
    dockerfiles[$current_index]="Dockerfile"
    image_names[$current_index]=""
    tags[$current_index]=""
    set_image_key "$current_index" "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
    continue
  fi

  if (( current_index < 0 )); then
    continue
  fi

  if [[ "$line" =~ ^[[:space:]]*([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]*:[[:space:]]*(.*)$ ]]; then
    set_image_key "$current_index" "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
  fi
done < "$config_path"

total=$((current_index + 1))
if (( total == 0 )); then
  echo "Warning: no images defined in $config_path" >&2
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker command not found but $total image build(s) are configured." >&2
  exit 1
fi

built=0
failures=0

for ((i = 0; i < total; i += 1)); do
  id="$(trim "${ids[$i]}")"
  context="$(trim "${contexts[$i]}")"
  dockerfile="$(trim "${dockerfiles[$i]}")"
  image_name="$(trim "${image_names[$i]}")"
  tag="$(trim "${tags[$i]}")"

  if [[ -z "$context" ]]; then
    context="."
  fi

  if [[ -z "$dockerfile" ]]; then
    dockerfile="Dockerfile"
  fi

  if [[ -z "$tag" && -n "$image_name" ]]; then
    tag="$image_name"
  fi

  if [[ -z "$tag" ]]; then
    if [[ -n "$id" ]]; then
      tag="${id}:local"
    else
      tag="image-${i}:local"
    fi
  fi

  if [[ -n "$id" ]]; then
    echo "==> [$id] Building ${tag}"
  else
    echo "==> [image-$i] Building ${tag}"
  fi

  echo "Running: docker build -f $dockerfile -t $tag $context"
  if docker build -f "$dockerfile" -t "$tag" "$context"; then
    ((built += 1))
  else
    status=$?
    echo "Error: image build failed for tag '$tag' with exit code $status." >&2
    ((failures += 1))
  fi
done

echo ""
echo "Build summary: total=$total; built=$built; failures=$failures"

if (( failures > 0 )); then
  exit 1
fi

exit 0
