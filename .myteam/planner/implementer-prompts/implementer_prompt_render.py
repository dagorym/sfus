#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def load_payload(path: str | None) -> dict[str, object]:
    if path:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    return json.loads(sys.stdin.read())


def render_list(title: str, values: list[str]) -> list[str]:
    lines = [title]
    for value in values:
        lines.append(f"- {value}")
    return lines


def main() -> int:
    parser = argparse.ArgumentParser(description="Render a canonical planner implementer prompt from structured JSON.")
    parser.add_argument("--input", help="Path to JSON input. Defaults to stdin.")
    args = parser.parse_args()

    payload = load_payload(args.input)
    required = [
        "allowed_files",
        "task",
        "acceptance_criteria",
        "validation_guidance",
        "tester_test_locations",
        "artifact_guidance",
    ]
    missing = [key for key in required if key not in payload]
    if missing:
        raise SystemExit(f"Missing required input fields: {', '.join(missing)}")

    allowed_files = [str(item) for item in payload["allowed_files"]]
    acceptance = [str(item) for item in payload["acceptance_criteria"]]
    validation = payload["validation_guidance"]
    if isinstance(validation, str):
        validation_items = [validation]
    else:
        validation_items = [str(item) for item in validation]
    tester_locations = [str(item) for item in payload["tester_test_locations"]]

    lines: list[str] = []
    lines.append("Your role is 'implementer'. Your task is as follows:")
    lines.append("")
    lines.extend(render_list("Allowed files:", allowed_files))
    lines.append("")
    lines.append("Task to implement:")
    lines.append(str(payload["task"]))
    lines.append("")
    lines.extend(render_list("Acceptance criteria:", acceptance))
    lines.append("")
    lines.extend(render_list("Validation guidance:", validation_items))
    lines.append("")
    lines.extend(render_list("Tester test-file location guidance:", tester_locations))
    lines.append("")
    lines.append("Artifact guidance:")
    lines.append(str(payload["artifact_guidance"]))
    lines.append("")
    lines.append("Startup behavior:")
    lines.append("Continue past preflight when blockers are absent.")
    lines.append("")
    lines.append("Completion gate:")
    lines.append("Do not report success unless all required artifacts exist and all changes are committed.")

    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
