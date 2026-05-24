#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


SEVERITIES = ("BLOCKING", "WARNING", "NOTE")
OUTCOMES = {"PASS", "CONDITIONAL PASS", "FAIL"}


def load_payload(path: str | None) -> dict[str, object]:
    if path:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    return json.loads(sys.stdin.read())


def as_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    if value is None:
        return []
    return [str(value)]


def render_list_block(title: str, values: list[str]) -> list[str]:
    lines = [title]
    if values:
        lines.extend(f"- {value}" for value in values)
    else:
        lines.append("- None")
    return lines


def normalize_findings(raw: object) -> list[dict[str, str]]:
    results: list[dict[str, str]] = []
    if not isinstance(raw, list):
        return results
    for item in raw:
        if not isinstance(item, dict):
            continue
        results.append(
            {
                "severity": str(item.get("severity", "")).upper(),
                "file": str(item.get("file", "")),
                "line": str(item.get("line", "")),
                "summary": str(item.get("summary", "")),
                "why_it_matters": str(item.get("why_it_matters", "")),
            }
        )
    return results


def count_findings(findings: list[dict[str, str]]) -> dict[str, int]:
    counts = {severity: 0 for severity in SEVERITIES}
    for item in findings:
        severity = item.get("severity", "")
        if severity in counts:
            counts[severity] += 1
    return counts


def validate_outcome(outcome: str, counts: dict[str, int]) -> None:
    if outcome not in OUTCOMES:
        raise SystemExit(f"Invalid final outcome: {outcome}")
    if outcome == "PASS" and counts["BLOCKING"] > 0:
        raise SystemExit("PASS outcome is invalid when blocking findings are present.")


def render_findings_section(findings: list[dict[str, str]], severity: str) -> list[str]:
    lines = [severity]
    matching = [item for item in findings if item.get("severity") == severity]
    if not matching:
        lines.append("- None")
        return lines
    for item in matching:
        location = item["file"]
        if item["line"]:
            location = f"{location}:{item['line']}"
        summary = item["summary"] or "No summary provided"
        if location:
            lines.append(f"- {location} - {summary}")
        else:
            lines.append(f"- {summary}")
        if item["why_it_matters"]:
            lines.append(f"  {item['why_it_matters']}")
    return lines


def render_report(payload: dict[str, object], findings: list[dict[str, str]], artifact_paths: list[str]) -> str:
    lines: list[str] = ["Reviewer Report", ""]
    lines.extend(render_list_block("Feature plan reviewed:", as_list(payload.get("feature_plan_reference"))))
    lines.append("")
    lines.extend(render_list_block("Inputs reviewed:", as_list(payload.get("inputs_reviewed"))))
    lines.append("")
    lines.extend(render_list_block("Overall feature completeness:", as_list(payload.get("overall_feature_completeness"))))
    lines.append("")
    lines.append("Findings")
    lines.append("")
    for severity in SEVERITIES:
        lines.extend(render_findings_section(findings, severity))
        lines.append("")
    lines.extend(render_list_block("Missed functionality or edge cases:", as_list(payload.get("missed_functionality_or_edge_cases"))))
    lines.append("")
    lines.extend(render_list_block("Follow-up feature requests for planning:", as_list(payload.get("follow_up_feature_requests"))))
    lines.append("")
    lines.extend(render_list_block("Artifacts written:", artifact_paths))
    lines.append("")
    lines.extend(render_list_block("Final outcome:", [str(payload["final_outcome"])]))
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Write reviewer artifacts from structured JSON input.")
    parser.add_argument("--input", help="Path to JSON input. Defaults to stdin.")
    parser.add_argument("--artifact-dir", required=True, help="Repository-root-relative or absolute artifact directory.")
    parser.add_argument("--repo-root", default=".", help="Repository root used to normalize artifact paths.")
    args = parser.parse_args()

    payload = load_payload(args.input)
    required = [
        "status",
        "branch_name",
        "feature_plan_reference",
        "inputs_reviewed",
        "overall_feature_completeness",
        "final_outcome",
    ]
    missing = [key for key in required if key not in payload]
    if missing:
        raise SystemExit(f"Missing required input fields: {', '.join(missing)}")

    findings = normalize_findings(payload.get("findings"))
    counts = count_findings(findings)
    validate_outcome(str(payload["final_outcome"]), counts)

    repo_root = Path(args.repo_root).resolve()
    artifact_dir = Path(args.artifact_dir)
    if not artifact_dir.is_absolute():
        artifact_dir = repo_root / artifact_dir
    artifact_dir.mkdir(parents=True, exist_ok=True)

    report_path = artifact_dir / "reviewer_report.md"
    result_path = artifact_dir / "reviewer_result.json"
    artifact_paths = [
        report_path.relative_to(repo_root).as_posix() if report_path.is_relative_to(repo_root) else report_path.as_posix(),
        result_path.relative_to(repo_root).as_posix() if result_path.is_relative_to(repo_root) else result_path.as_posix(),
    ]

    report_path.write_text(render_report(payload, findings, artifact_paths), encoding="utf-8")

    result_payload = {
        "status": payload["status"],
        "task_id": payload.get("task_id"),
        "branch_name": payload["branch_name"],
        "final_outcome": payload["final_outcome"],
        "blocking_finding_count": counts["BLOCKING"],
        "warning_finding_count": counts["WARNING"],
        "note_finding_count": counts["NOTE"],
        "follow_up_feature_requests": as_list(payload.get("follow_up_feature_requests")),
        "artifact_file_paths": artifact_paths,
    }
    result_path.write_text(json.dumps(result_payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(report_path.read_text(encoding="utf-8"), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
