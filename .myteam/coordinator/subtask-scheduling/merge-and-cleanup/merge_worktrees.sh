#!/usr/bin/env bash

set -euo pipefail

usage() {
	cat <<'EOF'
Usage:
  ./merge_worktrees.sh BRANCH_PREFIX

Finds local branches created from the given prefix using the naming pattern:
  <branch-prefix>-<agent-name>-<YYYYMMDD>

Merge order:
  1. verifier -> documenter
  2. documenter -> testing (or tester)
  3. testing (or tester) -> implementer
  4. implementer -> current branch

After all merges succeed, the script force-removes worktrees for all
matching agent branches and deletes the branches, including branches not
merged into the current branch such as verifier. Force-removal avoids
cleanup failures when a downstream agent left untracked byproducts in
its worktree after the committed branch state was already merged.
EOF
}

fail() {
	echo "Error: $*" >&2
	exit 1
}

note() {
	echo "$*"
}

require_clean_prefix() {
	local value="$1"

	[[ -n "$value" ]] || fail "branch prefix cannot be empty"
	[[ "$value" != */* ]] || fail "branch prefix cannot contain '/'"
	[[ "$value" =~ ^[A-Za-z0-9._-]+$ ]] || fail "branch prefix may only contain letters, numbers, dot, underscore, and hyphen"
}

parse_agent_branch() {
	local branch="$1"
	local prefix="$2"
	local rest

	[[ "$branch" == "$prefix"-* ]] || return 1
	rest="${branch#"$prefix"-}"
	[[ "$rest" =~ ^(.+)-([0-9]{8})$ ]] || return 1

	PARSED_AGENT_NAME="${BASH_REMATCH[1]}"
	PARSED_BRANCH_DATE="${BASH_REMATCH[2]}"
	return 0
}

ensure_clean_worktree() {
	local path="$1"
	local label="$2"

	git -C "$path" diff --quiet || fail "$label worktree has unstaged changes: $path"
	git -C "$path" diff --cached --quiet || fail "$label worktree has staged changes: $path"
}

ensure_checked_out_branch() {
	local path="$1"
	local expected_branch="$2"
	local actual_branch

	actual_branch="$(git -C "$path" branch --show-current)"
	[[ "$actual_branch" == "$expected_branch" ]] || fail "expected '$expected_branch' to be checked out in $path, found '$actual_branch'"
}

merge_into_branch() {
	local source_branch="$1"
	local target_branch="$2"
	local target_path="$3"

	[[ -n "$source_branch" ]] || return 0

	ensure_checked_out_branch "$target_path" "$target_branch"
	ensure_clean_worktree "$target_path" "$target_branch"

	note "Merging $source_branch into $target_branch"
	git -C "$target_path" merge --no-edit "$source_branch"
}

if [[ $# -ne 1 ]] || [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
	usage
	exit $(( $# == 1 ? 0 : 1 ))
fi

branch_prefix="$1"
require_clean_prefix "$branch_prefix"

git rev-parse --show-toplevel >/dev/null 2>&1 || fail "this script must be run inside a git repository"

repo_root="$(git rev-parse --show-toplevel)"
current_branch="$(git branch --show-current)"

[[ -n "$current_branch" ]] || fail "detached HEAD is not supported"

declare -a matching_branches=()
declare -A branch_by_agent=()
declare -A worktree_by_branch=()

while IFS= read -r branch; do
	if ! parse_agent_branch "$branch" "$branch_prefix"; then
		continue
	fi

	agent_name="$PARSED_AGENT_NAME"

	if [[ -n "${branch_by_agent[$agent_name]:-}" ]]; then
		fail "multiple branches found for agent '$agent_name': ${branch_by_agent[$agent_name]} and $branch"
	fi

	branch_by_agent["$agent_name"]="$branch"
	matching_branches+=("$branch")
done < <(git for-each-ref --format='%(refname:short)' refs/heads)

(( ${#matching_branches[@]} > 0 )) || fail "no local branches found for prefix '$branch_prefix'"

if [[ -n "${branch_by_agent[testing]:-}" && -n "${branch_by_agent[tester]:-}" ]]; then
	fail "found both testing and tester branches for prefix '$branch_prefix'; keep only one naming convention"
fi

if [[ -n "${branch_by_agent[implementer]:-}" && "$current_branch" == "${branch_by_agent[implementer]}" ]]; then
	fail "current branch is the implementer branch; run this script from the base branch you want to merge into"
fi

if [[ -n "${branch_by_agent[testing]:-}" && "$current_branch" == "${branch_by_agent[testing]}" ]]; then
	fail "current branch is the testing branch; run this script from the base branch you want to merge into"
fi

if [[ -n "${branch_by_agent[tester]:-}" && "$current_branch" == "${branch_by_agent[tester]}" ]]; then
	fail "current branch is the tester branch; run this script from the base branch you want to merge into"
fi

if [[ -n "${branch_by_agent[verifier]:-}" && "$current_branch" == "${branch_by_agent[verifier]}" ]]; then
	fail "current branch is the verifier branch; run this script from the base branch you want to merge into"
fi

if [[ -n "${branch_by_agent[documenter]:-}" && "$current_branch" == "${branch_by_agent[documenter]}" ]]; then
	fail "current branch is the documenter branch; run this script from the base branch you want to merge into"
fi

current_worktree=""
current_branch_for_worktree=""
while IFS= read -r line; do
	if [[ "$line" == worktree\ * ]]; then
		current_worktree="${line#worktree }"
		current_branch_for_worktree=""
		continue
	fi

	if [[ "$line" == branch\ refs/heads/* ]]; then
		current_branch_for_worktree="${line#branch refs/heads/}"
		worktree_by_branch["$current_branch_for_worktree"]="$current_worktree"
	fi
done < <(git worktree list --porcelain)

testing_branch="${branch_by_agent[testing]:-${branch_by_agent[tester]:-}}"
implementer_branch="${branch_by_agent[implementer]:-}"
verifier_branch="${branch_by_agent[verifier]:-}"
documenter_branch="${branch_by_agent[documenter]:-}"

[[ -n "$implementer_branch" ]] || fail "no implementer branch found for prefix '$branch_prefix'"

if [[ -n "$documenter_branch" && -z "$testing_branch" ]]; then
	fail "found a documenter branch but no testing/tester branch to merge it into"
fi

if [[ -n "$documenter_branch" && -z "${worktree_by_branch[$documenter_branch]:-}" ]]; then
	fail "documenter branch does not have an attached worktree: $documenter_branch"
fi

if [[ -n "$testing_branch" && -z "${worktree_by_branch[$testing_branch]:-}" ]]; then
	fail "testing branch does not have an attached worktree: $testing_branch"
fi

if [[ -n "$verifier_branch" && -z "$documenter_branch" ]]; then
	fail "found a verifier branch but no documenter branch to merge it into"
fi

if [[ -n "$verifier_branch" && -z "${worktree_by_branch[$verifier_branch]:-}" ]]; then
	fail "verifier branch does not have an attached worktree: $verifier_branch"
fi

if [[ -n "${worktree_by_branch[$implementer_branch]:-}" ]]; then
	implementer_worktree="${worktree_by_branch[$implementer_branch]}"
else
	fail "implementer branch does not have an attached worktree: $implementer_branch"
fi

ensure_checked_out_branch "$repo_root" "$current_branch"
ensure_clean_worktree "$repo_root" "$current_branch"

if [[ -n "$verifier_branch" ]]; then
	merge_into_branch "$verifier_branch" "$documenter_branch" "${worktree_by_branch[$documenter_branch]}"
fi

if [[ -n "$documenter_branch" ]]; then
	merge_into_branch "$documenter_branch" "$testing_branch" "${worktree_by_branch[$testing_branch]}"
fi

if [[ -n "$testing_branch" ]]; then
	merge_into_branch "$testing_branch" "$implementer_branch" "$implementer_worktree"
fi

merge_into_branch "$implementer_branch" "$current_branch" "$repo_root"

for branch in "${matching_branches[@]}"; do
	worktree_path="${worktree_by_branch[$branch]:-}"
	if [[ -n "$worktree_path" ]]; then
		note "Force-removing worktree $worktree_path"
		git worktree remove --force "$worktree_path"
	fi
done

for branch in "${matching_branches[@]}"; do
	note "Deleting branch $branch"
	git branch -D "$branch"
done

note "Merged agent branches into $current_branch and removed matching worktrees and branches for prefix '$branch_prefix'"
