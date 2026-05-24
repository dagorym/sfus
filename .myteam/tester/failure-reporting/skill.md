---
name: "failure-reporting"
description: "Stop cleanly after repeated test failure or invalid test generation and emit the required failure output."
---

# Tester Failure Reporting

Load this skill only when the tester must stop because the run has reached the 3-attempt limit, acceptance criteria remain unmet, or the produced tests are invalid and should not be handed off.

## Stop Conditions

- 3 attempts have been consumed, or
- tests remain failing because of an implementation defect, or
- test generation is incorrect, incomplete, or otherwise invalid and should not be committed.

## Required Failure Output

On the failure path, report:

- which acceptance criteria are not met
- expected vs. actual behavior for each unmet criterion
- implementation defects discovered when applicable
- whether the produced tests are valid and should be committed or invalid and should not be committed
- the final structured failure report content that must be written to `tester_report.md`

Also ensure the failure-path artifacts include:

- `tester_report.md` containing the final structured failure report presented in stdout
- failure-state `tester_result.json` recording:

- failure status
- available pass/fail totals when present
- unmet acceptance criteria when present
- no claim that `documenter_prompt.txt` was written

## Limits

- Do not produce a Documenter handoff prompt on the failure path.
- Do not claim success when the stop condition has been reached.
