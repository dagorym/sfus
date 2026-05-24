#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


DOCUMENTER_PROMPT_HEADER = "Documenter Agent Prompt"
DOCUMENTER_PROMPT_OPENING = "Your role is 'documenter'. Your task is as follows:"


def load_payload(path: str | None) -> dict[str, object]:
    if path:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    return json.loads(sys.stdin.read())


def list_block(title: str, values: list[str]) -> list[str]:
    lines = [title]
    if values:
        lines.extend(f"- {value}" for value in values)
    else:
        lines.append("- None")
    return lines


def render_documenter_prompt(payload: dict[str, object], artifact_dir: str) -> str:
    lines: list[str] = [DOCUMENTER_PROMPT_OPENING, ""]
    lines.extend(list_block("Task summary:", [str(payload["task_summary"])]))
    lines.append("")
    lines.extend(list_block("Acceptance criteria validated:", [str(item) for item in payload.get("acceptance_criteria_validated", [])]))
    lines.append("")
    lines.extend(
        list_block(
            "Implementation branch or worktree context:",
            [str(item) for item in payload.get("implementation_context", [])],
        )
    )
    lines.append("")
    lines.extend(
        list_block(
            "Files modified by Implementer and Tester to inspect for documentation impact:",
            [str(item) for item in payload.get("modified_files_for_documentation", [])],
        )
    )
    lines.append("")
    lines.extend(list_block("Test commit:", [str(payload["test_commit_hash"])]))
    lines.append("")
    lines.extend(list_block("Commands executed:", [str(item) for item in payload.get("commands_run", [])]))
    lines.append("")
    lines.extend(list_block("Final test outcomes:", [str(item) for item in payload.get("final_test_outcomes", [])]))
    lines.append("")
    lines.extend(list_block("Documentation context:", [str(item) for item in payload.get("documentation_context", [])]))
    lines.append("")
    lines.extend(list_block("Plan and diff context:", [str(item) for item in payload.get("plan_and_diff_context", [])]))
    lines.append("")
    lines.append("Startup behavior:")
    lines.append("- If Tester branch/worktree context and enough story and diff context are present, begin documentation work immediately and continue in the same run.")
    lines.append("- Infer missing plan-path, comparison-base, artifact-path, or documentation-convention details from repository context when repository evidence is sufficient, and label those choices as assumptions instead of treating them as blockers.")
    lines.append("- Do not stop after activation, scope confirmation, documentation discovery, or diff review when documentation work can proceed.")
    lines.append("")
    lines.extend(list_block("Shared artifact directory:", [artifact_dir]))
    lines.append("")
    lines.append("Completion gate:")
    lines.append("- Do not report success unless all required artifacts exist and all changes are committed.")
    return "\n".join(lines) + "\n"


def render_report(payload: dict[str, object], artifact_paths: list[str]) -> str:
    lines: list[str] = ["# Tester Report", ""]
    lines.extend(list_block("Status:", [str(payload["status"])]))
    lines.append("")
    lines.extend(list_block("Task summary:", [str(payload["task_summary"])]))
    lines.append("")
    lines.extend(list_block("Branch name:", [str(payload["branch_name"])]))
    lines.append("")
    lines.extend(list_block("Test commit hash:", [str(payload["test_commit_hash"])]))
    lines.append("")
    lines.extend(list_block("Test files added or modified:", [str(item) for item in payload.get("test_files_changed", [])]))
    lines.append("")
    lines.extend(list_block("Commands run:", [str(item) for item in payload.get("commands_run", [])]))
    lines.append("")
    totals = payload.get("pass_fail_totals", {})
    if isinstance(totals, dict):
        total_lines = [f"{key}: {value}" for key, value in sorted(totals.items())]
    else:
        total_lines = []
    lines.extend(list_block("Pass/fail totals:", total_lines))
    lines.append("")
    lines.extend(list_block("Unmet acceptance criteria:", [str(item) for item in payload.get("unmet_acceptance_criteria", [])]))
    lines.append("")
    lines.extend(list_block("Final test outcomes:", [str(item) for item in payload.get("final_test_outcomes", [])]))
    lines.append("")
    lines.extend(list_block("Cleanup status:", [str(item) for item in payload.get("cleanup_notes", [])]))
    lines.append("")
    lines.extend(list_block("Artifacts written:", artifact_paths))
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Write tester artifacts from structured JSON input.")
    parser.add_argument("--input", help="Path to JSON input. Defaults to stdin.")
    parser.add_argument("--artifact-dir", required=True, help="Repository-root-relative or absolute artifact directory.")
    parser.add_argument("--repo-root", default=".", help="Repository root used to normalize artifact paths.")
    args = parser.parse_args()

    payload = load_payload(args.input)
    required = [
        "status",
        "task_summary",
        "branch_name",
        "test_commit_hash",
        "test_files_changed",
        "commands_run",
        "final_test_outcomes",
    ]
    missing = [key for key in required if key not in payload]
    if missing:
        raise SystemExit(f"Missing required input fields: {', '.join(missing)}")

    repo_root = Path(args.repo_root).resolve()
    artifact_dir = Path(args.artifact_dir)
    if not artifact_dir.is_absolute():
        artifact_dir = repo_root / artifact_dir
    artifact_dir.mkdir(parents=True, exist_ok=True)

    rel_artifact_dir = artifact_dir.relative_to(repo_root).as_posix() if artifact_dir.is_relative_to(repo_root) else artifact_dir.as_posix()

    report_path = artifact_dir / "tester_report.md"
    result_path = artifact_dir / "tester_result.json"
    prompt_path = artifact_dir / "documenter_prompt.txt"

    artifact_paths = [
        report_path.relative_to(repo_root).as_posix() if report_path.is_relative_to(repo_root) else report_path.as_posix(),
        result_path.relative_to(repo_root).as_posix() if result_path.is_relative_to(repo_root) else result_path.as_posix(),
    ]

    prompt_body = None
    if str(payload["status"]).lower() == "success":
        prompt_required = [
            "acceptance_criteria_validated",
            "implementation_context",
            "modified_files_for_documentation",
            "documentation_context",
            "plan_and_diff_context",
        ]
        prompt_missing = [key for key in prompt_required if key not in payload]
        if prompt_missing:
            raise SystemExit(
                "Missing required success-path input fields: " + ", ".join(prompt_missing)
            )
        prompt_body = render_documenter_prompt(payload, rel_artifact_dir)
        prompt_path.write_text(prompt_body, encoding="utf-8")
        artifact_paths.append(prompt_path.relative_to(repo_root).as_posix() if prompt_path.is_relative_to(repo_root) else prompt_path.as_posix())

    report_path.write_text(render_report(payload, artifact_paths), encoding="utf-8")

    result_payload = {
        "status": payload["status"],
        "task_id": payload.get("task_id"),
        "branch_name": payload["branch_name"],
        "test_commit_hash": payload["test_commit_hash"],
        "test_files_changed": [str(item) for item in payload.get("test_files_changed", [])],
        "commands_run": [str(item) for item in payload.get("commands_run", [])],
        "pass_fail_totals": payload.get("pass_fail_totals"),
        "unmet_acceptance_criteria": [str(item) for item in payload.get("unmet_acceptance_criteria", [])],
        "artifact_file_paths": artifact_paths,
    }
    result_path.write_text(json.dumps(result_payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    if prompt_body:
        print(f"{DOCUMENTER_PROMPT_HEADER}\n{prompt_body}", end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
