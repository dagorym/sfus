#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


VERIFIER_PROMPT_HEADER = "Verifier Agent Prompt"
VERIFIER_PROMPT_OPENING = "Your role is 'verifier'. Your task is as follows:"


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


def render_verifier_prompt(payload: dict[str, object], artifact_dir: str) -> str:
    lines: list[str] = [VERIFIER_PROMPT_OPENING, ""]
    lines.extend(list_block("Original task summary:", [str(payload["task_summary"])]))
    lines.append("")
    lines.extend(list_block("Acceptance criteria to verify:", [str(item) for item in payload.get("acceptance_criteria", [])]))
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
            "Files modified by the Implementer, Tester, and Documenter:",
            [str(item) for item in payload.get("all_modified_files", [])],
        )
    )
    lines.append("")
    lines.extend(list_block("Commands executed:", [str(item) for item in payload.get("commands_run", [])]))
    lines.append("")
    lines.extend(list_block("Final test outcomes:", [str(item) for item in payload.get("final_test_outcomes", [])]))
    lines.append("")
    lines.extend(list_block("Plan or evaluation context guidance:", [str(item) for item in payload.get("plan_context", [])]))
    lines.append("")
    lines.extend(list_block("Convention-file guidance:", [str(item) for item in payload.get("convention_guidance", [])]))
    lines.append("")
    lines.extend(list_block("Updated documentation files:", [str(item) for item in payload.get("documentation_files_changed", [])]))
    lines.append("")
    lines.extend(list_block("Shared artifact directory:", [artifact_dir]))
    lines.append("")
    lines.append("Verification scope:")
    lines.append("- Review implementation, tests, and updated documentation together.")
    lines.append("- Infer missing plan-source, convention-file, or artifact-path details from repository context when safe.")
    lines.append("- Continue in the same run when blockers are absent.")
    lines.append("")
    lines.append("Completion gate:")
    lines.append("- Do not report success unless all required artifacts exist and all changes are committed.")
    return "\n".join(lines) + "\n"


def render_report(payload: dict[str, object], artifact_paths: list[str]) -> str:
    lines: list[str] = ["# Documenter Report", ""]
    lines.extend(list_block("Status:", [str(payload["status"])]))
    lines.append("")
    lines.extend(list_block("Task summary:", [str(payload["task_summary"])]))
    lines.append("")
    lines.extend(list_block("Branch name:", [str(payload["branch_name"])]))
    lines.append("")
    lines.extend(list_block("Documentation commit hash:", [str(payload["documentation_commit_hash"])]))
    lines.append("")
    lines.extend(list_block("Documentation files added or modified:", [str(item) for item in payload.get("documentation_files_changed", [])]))
    lines.append("")
    lines.extend(list_block("Commands run:", [str(item) for item in payload.get("commands_run", [])]))
    lines.append("")
    lines.extend(list_block("Final test outcomes:", [str(item) for item in payload.get("final_test_outcomes", [])]))
    lines.append("")
    lines.extend(list_block("Assumptions:", [str(item) for item in payload.get("assumptions", [])]))
    lines.append("")
    lines.extend(list_block("Artifacts written:", artifact_paths))
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Write documenter artifacts from structured JSON input.")
    parser.add_argument("--input", help="Path to JSON input. Defaults to stdin.")
    parser.add_argument("--artifact-dir", required=True, help="Repository-root-relative or absolute artifact directory.")
    parser.add_argument("--repo-root", default=".", help="Repository root used to normalize artifact paths.")
    args = parser.parse_args()

    payload = load_payload(args.input)
    required = [
        "status",
        "task_summary",
        "branch_name",
        "documentation_commit_hash",
        "documentation_files_changed",
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

    report_path = artifact_dir / "documenter_report.md"
    result_path = artifact_dir / "documenter_result.json"
    prompt_path = artifact_dir / "verifier_prompt.txt"

    artifact_paths = [
        report_path.relative_to(repo_root).as_posix() if report_path.is_relative_to(repo_root) else report_path.as_posix(),
        result_path.relative_to(repo_root).as_posix() if result_path.is_relative_to(repo_root) else result_path.as_posix(),
    ]

    prompt_body = None
    if str(payload["status"]).lower() == "success":
        prompt_required = [
            "acceptance_criteria",
            "implementation_context",
            "all_modified_files",
            "plan_context",
            "convention_guidance",
        ]
        prompt_missing = [key for key in prompt_required if key not in payload]
        if prompt_missing:
            raise SystemExit("Missing required success-path input fields: " + ", ".join(prompt_missing))
        prompt_body = render_verifier_prompt(payload, rel_artifact_dir)
        prompt_path.write_text(prompt_body, encoding="utf-8")
        artifact_paths.append(prompt_path.relative_to(repo_root).as_posix() if prompt_path.is_relative_to(repo_root) else prompt_path.as_posix())

    report_path.write_text(render_report(payload, artifact_paths), encoding="utf-8")

    result_payload = {
        "status": payload["status"],
        "task_id": payload.get("task_id"),
        "branch_name": payload["branch_name"],
        "documentation_commit_hash": payload["documentation_commit_hash"],
        "documentation_files_changed": [str(item) for item in payload.get("documentation_files_changed", [])],
        "artifact_file_paths": artifact_paths,
    }
    result_path.write_text(json.dumps(result_payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    if prompt_body:
        print(f"{VERIFIER_PROMPT_HEADER}\n{prompt_body}", end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
