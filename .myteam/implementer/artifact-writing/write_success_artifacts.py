#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


TESTER_PROMPT_HEADER = "Tester Agent Prompt"
TESTER_PROMPT_OPENING = "Your role is 'tester'. Your task is as follows:"


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


def render_tester_prompt_body(payload: dict[str, object], artifact_dir: str) -> str:
    task_summary = str(payload["task_summary"])
    changed_files = [str(item) for item in payload.get("changed_files", [])]
    acceptance = [str(item) for item in payload.get("acceptance_criteria", [])]
    test_locations = [str(item) for item in payload.get("test_location_guidance", [])]
    implementation_context = [str(item) for item in payload.get("implementation_context", [])]
    validation_commands = [str(item) for item in payload.get("validation_commands", [])]
    expected_failures = [str(item) for item in payload.get("expected_validation_failures", [])]

    lines: list[str] = [TESTER_PROMPT_OPENING, ""]
    lines.extend(list_block("Task summary:", [task_summary]))
    lines.append("")
    lines.extend(list_block("Modified files:", changed_files))
    lines.append("")
    lines.extend(list_block("Acceptance criteria to validate (from Planner):", acceptance))
    lines.append("")
    lines.extend(list_block("Create test files in:", test_locations))
    lines.append("")
    lines.extend(list_block("Implementation context for testing:", implementation_context))
    lines.append("")
    lines.extend(list_block("Suggested test command(s):", validation_commands))
    lines.append("")
    lines.extend(list_block("Existing validations expected to fail only because approved behavior changed:", expected_failures))
    lines.append("")
    lines.append("Startup behavior:")
    lines.append("- If acceptance criteria and implementation context are present, begin testing work immediately and continue in the same run.")
    lines.append("- Infer missing test-location or test-command details from repository conventions when repository evidence is sufficient, and label those choices as assumptions instead of treating them as blockers.")
    lines.append("- Do not stop after activation, directory discovery, artifact-directory confirmation, or framework discovery when testing can proceed.")
    lines.append("")
    lines.extend(list_block("Shared artifact directory:", [artifact_dir]))
    lines.append("")
    lines.append("Completion gate:")
    lines.append("- Do not report success unless all required artifacts exist and all changes are committed.")
    return "\n".join(lines) + "\n"


def render_report(payload: dict[str, object], artifact_paths: list[str]) -> str:
    lines: list[str] = ["# Implementer Report", ""]
    lines.extend(list_block("Status:", [str(payload["status"])]))
    lines.append("")
    lines.extend(list_block("Task summary:", [str(payload["task_summary"])]))
    lines.append("")
    lines.extend(list_block("Changed files:", [str(item) for item in payload.get("changed_files", [])]))
    lines.append("")
    lines.extend(list_block("Validation commands run:", [str(item) for item in payload.get("validation_commands", [])]))
    lines.append("")
    lines.extend(list_block("Validation outcome:", [str(payload["validation_outcome"])]))
    lines.append("")
    lines.extend(list_block("Implementation/code commit hash:", [str(payload["code_commit_hash"])]))
    lines.append("")
    lines.extend(list_block("Artifacts written:", artifact_paths))
    lines.append("")
    lines.extend(list_block("Implementation context:", [str(item) for item in payload.get("implementation_context", [])]))
    lines.append("")
    lines.extend(list_block("Expected validation failures carried forward:", [str(item) for item in payload.get("expected_validation_failures", [])]))
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Write implementer success-path artifacts from structured JSON input.")
    parser.add_argument("--input", help="Path to JSON input. Defaults to stdin.")
    parser.add_argument("--artifact-dir", required=True, help="Repository-root-relative or absolute artifact directory.")
    parser.add_argument("--repo-root", default=".", help="Repository root used to normalize artifact paths.")
    args = parser.parse_args()

    payload = load_payload(args.input)
    required = [
        "status",
        "task_summary",
        "branch_name",
        "code_commit_hash",
        "changed_files",
        "validation_commands",
        "validation_outcome",
        "acceptance_criteria",
        "test_location_guidance",
        "implementation_context",
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

    tester_prompt_body = render_tester_prompt_body(payload, rel_artifact_dir)
    report_path = artifact_dir / "implementer_report.md"
    tester_prompt_path = artifact_dir / "tester_prompt.txt"
    result_path = artifact_dir / "implementer_result.json"

    tester_prompt_path.write_text(tester_prompt_body, encoding="utf-8")

    artifact_paths = [
        report_path.relative_to(repo_root).as_posix() if report_path.is_relative_to(repo_root) else report_path.as_posix(),
        tester_prompt_path.relative_to(repo_root).as_posix() if tester_prompt_path.is_relative_to(repo_root) else tester_prompt_path.as_posix(),
        result_path.relative_to(repo_root).as_posix() if result_path.is_relative_to(repo_root) else result_path.as_posix(),
    ]

    report_path.write_text(render_report(payload, artifact_paths), encoding="utf-8")

    result_payload = {
        "status": payload["status"],
        "task_id": payload.get("task_id"),
        "branch_name": payload["branch_name"],
        "pass_label": payload.get("pass_label"),
        "code_commit_hash": payload["code_commit_hash"],
        "changed_files": [str(item) for item in payload.get("changed_files", [])],
        "validation_commands": [str(item) for item in payload.get("validation_commands", [])],
        "validation_outcome": payload["validation_outcome"],
        "artifact_file_paths": artifact_paths,
    }
    result_path.write_text(json.dumps(result_payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    stdout_lines = [TESTER_PROMPT_HEADER, tester_prompt_body]
    print("\n".join(stdout_lines), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
