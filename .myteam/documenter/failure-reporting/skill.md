---
name: "failure-reporting"
description: "Stop cleanly when documentation scope or blockers remain unresolved and emit the required failure report."
---

# Documenter Failure Reporting

Load this skill only when the documenter cannot determine what changed or cannot resolve a blocker after repeated attempts.

## Required Failure Report

Report using exactly this structure:

```md
### Failure Report

1. **Agent:** Documenter
2. **Subtask:** Which area of documentation you were updating
3. **Error:** The issue encountered
4. **Attempts:** What you tried to resolve it
5. **Branch state:** What has been committed vs uncommitted
```

## Limits

- Stop after 5 unresolved attempts.
- Do not claim success on the failure path.
