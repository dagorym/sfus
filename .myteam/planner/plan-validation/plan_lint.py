#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


PROMPT_PREFIX = "Your role is 'implementer'. Your task is as follows:"
COMPLETION_GATE = "Do not report success unless all required artifacts exist and all changes are committed."
PLACEHOLDER_PATTERNS = [r"\bTBD\b", r"choose one", r"decide later", r"to be determined"]

# A subtask section heading looks like `### FU3-1 — <title>`: a stable id token
# followed by a title separator. Prompt-block headings (`### FU3-1 prompt`) and
# bare reference headings (`### PF-1`) are intentionally NOT subtasks.
SUBTASK_HEADING_RE = re.compile(r"^#{2,4}\s+([A-Za-z][A-Za-z0-9]*-\d+)\b(.*)$")
SUBTASK_TITLE_SEPARATORS = ("—", "–", "-", ":")  # em dash, en dash, hyphen, colon


def load_text(path: str | None) -> str:
    if path:
        return Path(path).read_text(encoding="utf-8")
    return sys.stdin.read()


def find_subtask_ids(text: str) -> list[str]:
    """Detect subtask identifiers from subtask *section headings* only.

    This deliberately excludes cross-references in prose/tables (``D-5``,
    ``C-7``, ``axis-2``, ``G-3`` ...), the per-subtask prompt-block headings
    (``### FU3-1 prompt``), and bare reference headings with no title
    (``### PF-1``) — none of which are subtasks. If no conforming subtask
    heading is found, fall back to the legacy whole-text scan so a
    differently-formatted plan is not misreported as having no identifiers.
    """
    ids: list[str] = []
    for line in text.splitlines():
        match = SUBTASK_HEADING_RE.match(line)
        if not match:
            continue
        remainder = match.group(2).lstrip()
        if remainder[:1] in SUBTASK_TITLE_SEPARATORS:
            ids.append(match.group(1))
    if not ids:
        ids = re.findall(r"\b[A-Za-z]+-\d+\b", text)
    return list(dict.fromkeys(ids))


def lint(text: str) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []

    required_sections = [
        "Documentation Impact",
        "Dependency Ordering",
        "Implementer Prompts",
        "Output Artifact Path",
    ]
    for section in required_sections:
        if section not in text:
            findings.append({"level": "error", "message": f"Missing required section: {section}"})

    prompt_count = text.count(PROMPT_PREFIX)
    subtask_ids = find_subtask_ids(text)
    if not subtask_ids:
        findings.append({"level": "error", "message": "No stable subtask identifiers detected."})
    if prompt_count == 0:
        findings.append({"level": "error", "message": "No implementer prompt blocks detected."})
    elif subtask_ids and prompt_count < len(subtask_ids):
        findings.append(
            {
                "level": "error",
                "message": f"Implementer prompt count ({prompt_count}) is lower than subtask count ({len(subtask_ids)}); each subtask heading needs its own implementer prompt block.",
            }
        )

    if COMPLETION_GATE not in text:
        findings.append({"level": "error", "message": "Missing explicit implementer completion gate."})

    doc_impact_count = text.count("Documentation Impact")
    if subtask_ids and doc_impact_count < 1 + len(subtask_ids):
        findings.append(
            {
                "level": "warning",
                "message": "Documentation Impact sections may be missing for one or more subtasks.",
            }
        )

    for pattern in PLACEHOLDER_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            findings.append({"level": "warning", "message": f"Detected unresolved placeholder text matching: {pattern}"})

    if re.search(r"routine test (creation|update|authoring)", text, re.IGNORECASE):
        findings.append(
            {
                "level": "warning",
                "message": "Plan may be assigning routine test-authoring work directly to implementer subtasks.",
            }
        )

    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description="Lint a planner plan artifact for structural contract violations.")
    parser.add_argument("--input", help="Path to plan markdown. Defaults to stdin.")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON instead of plain text.")
    args = parser.parse_args()

    text = load_text(args.input)
    findings = lint(text)
    result = {"ok": not any(item["level"] == "error" for item in findings), "findings": findings}

    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        if not findings:
            print("OK: no structural planner contract violations detected.")
        else:
            for item in findings:
                print(f"{item['level'].upper()}: {item['message']}")

    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
