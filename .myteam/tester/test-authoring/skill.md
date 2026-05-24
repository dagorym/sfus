---
name: "test-authoring"
description: "Decide whether to keep, add, or update tests and author only the necessary test changes."
---

# Tester Test Authoring

Load this skill only when the tester is deciding how to cover the acceptance criteria or is actively writing test changes.

## Decision Rules

- Audit existing tests first to determine whether they already validate each acceptance criterion and the implemented behavior.
- Prefer existing tests when they already provide sufficient coverage.
- Add new tests only for uncovered acceptance criteria or additional implementation-introduced edge cases.
- Update existing tests only when an expected regression or intentionally changed behavior requires it.
- Treat modification of an existing test as a last resort and call out that choice explicitly in the report.

## Authoring Rules

- Create one test per acceptance criterion when that is a natural fit and new coverage is actually needed.
- Use clear, descriptive test names that reference the criterion.
- Name test files after the code or behavior under test, not after milestone, phase, task, or subtask labels.
- Include setup, execution, and assertion phases.
- Add comments linking tests to specific acceptance criteria when that improves traceability.
- Never modify implementation code.

## Limits

- Do not create or modify files outside allowed test directories, except for required artifact outputs.
- Do not introduce new test dependencies without explicit approval.
- If creating test helpers or utilities would materially improve quality, stop and ask before introducing them.
