#!/usr/bin/env bash

set -u -o pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
config_path="${1:-${repo_root}/cicd/config/validation-config.yml}"

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

if [[ ! -f "$config_path" ]]; then
  echo "Validation config not found: $config_path" >&2
  exit 1
fi

cd "$repo_root" || exit 1

emit_warning() {
  local message="$1"
  echo "Warning: ${message}" >&2
  if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
    echo "::warning::${message}"
  fi
}

warn_on_missing_command=true
declare -a ids
declare -a descriptions
declare -a sh_commands
current_index=-1

while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" =~ ^[[:space:]]*warn_on_missing_command:[[:space:]]*(.+)[[:space:]]*$ ]]; then
    raw_value="$(parse_scalar "${BASH_REMATCH[1]}")"
    case "${raw_value,,}" in
      false|no|off|0)
        warn_on_missing_command=false
        ;;
      *)
        warn_on_missing_command=true
        ;;
    esac
    continue
  fi

  if [[ "$line" =~ ^[[:space:]]*-[[:space:]]id:[[:space:]]*(.+)[[:space:]]*$ ]]; then
    ((current_index += 1))
    ids[$current_index]="$(parse_scalar "${BASH_REMATCH[1]}")"
    descriptions[$current_index]=""
    sh_commands[$current_index]=""
    continue
  fi

  if (( current_index < 0 )); then
    continue
  fi

  if [[ "$line" =~ ^[[:space:]]*description:[[:space:]]*(.+)[[:space:]]*$ ]]; then
    descriptions[$current_index]="$(parse_scalar "${BASH_REMATCH[1]}")"
    continue
  fi

  if [[ "$line" =~ ^[[:space:]]*command:[[:space:]]*(.*)$ ]]; then
    sh_commands[$current_index]="$(parse_scalar "${BASH_REMATCH[1]}")"
  fi
done < "$config_path"

total="${#ids[@]}"
if (( total == 0 )); then
  emit_warning "no validations defined in $config_path"
  exit 0
fi

executed=0
warnings=0
failures=0

for ((i = 0; i < total; i += 1)); do
  id="${ids[$i]}"
  description="${descriptions[$i]}"
  command="$(trim "${sh_commands[$i]}")"

  if [[ -n "$description" ]]; then
    echo "==> [$id] $description"
  else
    echo "==> [$id]"
  fi

  if [[ -z "$command" ]]; then
    if [[ "$warn_on_missing_command" == "true" ]]; then
      emit_warning "validation '$id' has no command configured; skipping."
      ((warnings += 1))
      continue
    fi

    echo "Error: validation '$id' has no command configured." >&2
    ((failures += 1))
    continue
  fi

  echo "Running: $command"
  if bash -o pipefail -c "$command"; then
    ((executed += 1))
  else
    status=$?
    echo "Error: validation '$id' failed with exit code $status." >&2
    ((failures += 1))
  fi
done

echo ""
echo "Validation summary: total=$total; executed=$executed; warnings=$warnings; failures=$failures"

if (( failures > 0 )); then
  exit 1
fi

if (( executed == 0 && warnings > 0 )); then
  echo "Completed with warnings only."
fi

exit 0
