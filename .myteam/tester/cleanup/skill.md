---
name: "cleanup"
description: "Remove temporary non-handoff byproducts or report what could not be cleaned safely."
---

# Tester Cleanup

Load this skill only when test authoring or execution may have produced files that are not intended to be committed or handed forward.

## Required Actions

- Identify files created during test authoring or execution that are not required handoff artifacts and are not intended to be committed or passed to the Documenter.
- Remove those temporary byproducts before the final status report, final commit decision, or downstream handoff.
- Preserve required outputs such as `tester_report.md`, `tester_result.json`, and `documenter_prompt.txt` when applicable.

## Ambiguity Handling

- If it is ambiguous whether a file is a required deliverable or a temporary byproduct, stop and ask before deleting it.
- If cleanup cannot be completed safely, report the exact remaining files and why they were left in place.

## Limits

- Do not delete required artifacts.
- Do not silently retain leftover byproducts without reporting them.
