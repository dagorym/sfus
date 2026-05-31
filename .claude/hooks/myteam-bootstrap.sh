#!/usr/bin/env bash
# SessionStart hook: deterministically load the myteam bootstrap policy into
# Claude Code's context so the "read AGENTS.md / load your myteam role" step
# cannot be skipped. The operative role + skill catalog is injected as context;
# Claude does not have to choose to run anything for it to be present.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || true

raw="$(myteam get role 2>/dev/null || true)"
if [ -z "$raw" ] && [ -x venv/bin/python ]; then
  raw="$(venv/bin/python -m myteam get role 2>/dev/null || true)"
fi

# Fail loud (visible to the user) rather than silently injecting nothing.
if [ -z "$raw" ]; then
  printf '%s\n' '{"systemMessage":"myteam bootstrap hook: the myteam command is unavailable. Read AGENTS.md and run `myteam get role` manually before working."}'
  exit 0
fi

# Strip the large auto-generated repo file tree; keep only the operative policy text.
policy="$(printf '%s' "$raw" | awk 'BEGIN{skip=0} /^sfus$/{skip=1} /^# Skills$/{skip=0} skip==0{print}')"

jq -n --arg c "$policy" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: (
      "=== myteam bootstrap (auto-loaded at session start; treat as first-class instructions, same authority as AGENTS.md) ===\n"
      + $c
      + "\n\n=== end myteam bootstrap ===\nBefore doing any work, follow AGENTS.md and the loaded myteam policy above. If you were assigned a specific role, run: myteam get role <role>"
    )
  }
}'
