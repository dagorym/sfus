---
name: "final-reviewer"
description: "Compose and launch the final Reviewer stage after all subtasks are merged."
---

# Coordinator Final Reviewer

Load this skill only when all subtasks have completed successfully and been merged into the coordination base branch.

## Required Actions

- Verify that no planned subtask remains pending, in flight, failed, or awaiting a user decision before launching the Reviewer.
- Create a dedicated review worktree from the coordination base branch.
- Resolve reviewer artifacts to the plan-level artifact directory.
- Reread `.myteam/reviewer/role.md` immediately before writing the Reviewer prompt.
- Compose the Reviewer launch prompt from the approved plan, completed subtask outputs, and the current reviewer definition.
- Instruct the Reviewer that the review is not complete until `reviewer_report.md` and `reviewer_result.json` are written to the resolved artifact directory and committed.
- Start the substantive Reviewer prompt with the exact line `Your role is 'reviewer'. Your task is as follows:`.
- Include the required coordinator wrapper lines ahead of the substantive Reviewer prompt body.
- Launch the Reviewer as an isolated sub-agent, then validate the resolved reviewer artifact directory before reporting the outcome.
- After artifact validation, merge the reviewer branch into the coordination base branch, remove the reviewer worktree, and delete the reviewer branch — regardless of whether the Reviewer verdict is PASS, CONDITIONAL PASS, or FAIL:
  1. From the coordination base branch in the repository root: `git merge --no-edit <reviewer-branch>`
  2. Remove the worktree: `git worktree remove --force <reviewer-worktree-path>`
  3. Delete the branch: `git branch -D <reviewer-branch>`

## Limits

- Do not launch this skill after an individual subtask completion or merge event.
- Do not treat a partially completed plan as eligible for final review.
- Do not accept a chat-only Reviewer verdict when the required reviewer artifact files are missing.
- Do not defer reviewer branch merge-back; perform it immediately after artifact validation and before handing off to `completion-reporting`.
