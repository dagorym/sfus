#!/usr/bin/env bash

set -euo pipefail

usage() {
	cat <<'EOF'
Usage:
  ./create_worktree.sh TOP_LEVEL_DIR BRANCH_NAME
  ./create_worktree.sh TOP_LEVEL_DIR AGENT_NAME

Creates a git worktree on a new branch based on the current branch.

If the second argument looks like a full branch name ending in -YYYYMMDD,
that branch name is used directly.

Otherwise, the second argument is treated as an agent name and the script
builds the branch name from the current branch:
  <current-branch-prefix>-<agent-name>-<today>

If the current branch already ends in -<agent>-<YYYYMMDD>, that suffix is
removed before the new agent/date suffix is appended.

If TOP_LEVEL_DIR resolves under /mnt/c/Users/.../Documents, the script uses
~/worktrees instead. Git worktrees are unreliable there under WSL.
EOF
}

fail() {
	echo "Error: $*" >&2
	exit 1
}

require_clean_name() {
	local value="$1"
	local label="$2"

	[[ -n "$value" ]] || fail "$label cannot be empty"
	[[ "$value" != */* ]] || fail "$label cannot contain '/' because the worktree directory matches the branch name"
	[[ "$value" =~ ^[A-Za-z0-9._-]+$ ]] || fail "$label may only contain letters, numbers, dot, underscore, and hyphen"
}

looks_like_full_branch_name() {
	local value="$1"
	[[ "$value" =~ -[0-9]{8}$ ]]
}

if [[ $# -ne 2 ]] || [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
	usage
	exit $(( $# == 2 ? 0 : 1 ))
fi

top_level_dir="$1"
branch_or_agent="$2"

git rev-parse --show-toplevel >/dev/null 2>&1 || fail "this script must be run inside a git repository"

repo_root="$(git rev-parse --show-toplevel)"
current_branch="$(git branch --show-current)"
today="$(date +%Y%m%d)"
top_level_dir="$(realpath -m "$top_level_dir")"

if [[ "$top_level_dir" =~ ^/mnt/c/Users/[^/]+/Documents($|/) ]]; then
	fallback_top_level_dir="$HOME/worktrees"
	echo "Notice: $top_level_dir is under /mnt/c/Users/.../Documents, which is unreliable for git worktrees in WSL." >&2
	echo "Notice: using $fallback_top_level_dir instead." >&2
	top_level_dir="$fallback_top_level_dir"
fi

[[ -n "$current_branch" ]] || fail "detached HEAD is not supported"

if looks_like_full_branch_name "$branch_or_agent"; then
	branch_name="$branch_or_agent"
else
	agent_name="$branch_or_agent"
	require_clean_name "$agent_name" "agent name"

	branch_prefix="$(printf '%s\n' "$current_branch" | sed -E 's/-[^-]+-[0-9]{8}$//')"
	[[ -n "$branch_prefix" ]] || fail "could not derive a branch prefix from current branch '$current_branch'"
	branch_name="${branch_prefix}-${agent_name}-${today}"
fi

require_clean_name "$branch_name" "branch name"
git check-ref-format --branch "$branch_name" >/dev/null 2>&1 || fail "invalid git branch name: $branch_name"

worktree_dir="${top_level_dir%/}/$branch_name"

[[ "$(realpath "$repo_root")" != "$(realpath -m "$worktree_dir")" ]] || fail "worktree directory cannot be the repository root"
[[ ! -e "$worktree_dir" ]] || fail "worktree directory already exists: $worktree_dir"

git show-ref --verify --quiet "refs/heads/$branch_name" && fail "branch already exists: $branch_name"
mkdir -p "$top_level_dir"

git worktree add -b "$branch_name" "$worktree_dir" "$current_branch"

echo "Created branch: $branch_name"
echo "Created worktree: $worktree_dir"
