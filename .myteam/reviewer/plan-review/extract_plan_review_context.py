#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


HEADING_RE = re.compile(r"^(#{1,6})\s+(.*\S)\s*$")
BULLET_RE = re.compile(r"^\s*[-*+]\s+(.*\S)\s*$")
CHECKLIST_RE = re.compile(r"^\s*[-*+]\s+\[(?: |x|X)\]\s+(.*\S)\s*$")
ORDER_HINT_RE = re.compile(r"\b(depends?|dependency|before|after|blocked|blocker|sequence|order|prereq|prerequisite)\b", re.IGNORECASE)
CROSS_HINT_RE = re.compile(r"\b(cross|integration|end-to-end|e2e|between|across|interface|coordination|handoff)\b", re.IGNORECASE)
NON_FUNCTIONAL_RE = re.compile(
    r"\b(performance|security|reliability|latency|compatibility|migration|observability|logging|documentation|docs)\b",
    re.IGNORECASE,
)


def load_text(path: str | None) -> str:
    if path:
        return Path(path).read_text(encoding="utf-8")
    return sys.stdin.read()


def normalize(line: str) -> str:
    return re.sub(r"\s+", " ", line.strip())


def parse_sections(text: str) -> list[dict[str, object]]:
    sections: list[dict[str, object]] = []
    current = {"title": "Preamble", "level": 0, "lines": []}
    for raw_line in text.splitlines():
        heading = HEADING_RE.match(raw_line)
        if heading:
            sections.append(current)
            current = {"title": normalize(heading.group(2)), "level": len(heading.group(1)), "lines": []}
            continue
        current["lines"].append(raw_line.rstrip())
    sections.append(current)
    return sections


def parse_list_items(lines: list[str]) -> tuple[list[str], list[str]]:
    bullets: list[str] = []
    checklists: list[str] = []
    for raw_line in lines:
        checklist = CHECKLIST_RE.match(raw_line)
        if checklist:
            checklists.append(normalize(checklist.group(1)))
            continue
        bullet = BULLET_RE.match(raw_line)
        if bullet:
            bullets.append(normalize(bullet.group(1)))
    return bullets, checklists


def collect_section_lines(sections: list[dict[str, object]], title_tokens: tuple[str, ...]) -> list[str]:
    values: list[str] = []
    for section in sections:
        title = str(section["title"]).lower()
        if any(token in title for token in title_tokens):
            lines = [normalize(line) for line in section["lines"] if normalize(line)]
            values.extend(lines)
    return list(dict.fromkeys(values))


def collect_matching_lines(sections: list[dict[str, object]], pattern: re.Pattern[str]) -> list[str]:
    values: list[str] = []
    for section in sections:
        title = str(section["title"])
        if pattern.search(title):
            values.append(title)
        for raw_line in section["lines"]:
            line = normalize(raw_line)
            if line and pattern.search(line):
                values.append(line)
    return list(dict.fromkeys(values))


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract reviewer plan context from a markdown plan.")
    parser.add_argument("--input", help="Path to the plan markdown file. Defaults to stdin.")
    args = parser.parse_args()

    text = load_text(args.input)
    sections = parse_sections(text)

    all_bullets: list[str] = []
    all_checklists: list[str] = []
    for section in sections:
        bullets, checklists = parse_list_items(section["lines"])
        all_bullets.extend(bullets)
        all_checklists.extend(checklists)

    goals = collect_section_lines(sections, ("goal", "objective", "summary", "scope", "overview"))
    if not goals:
        goals = all_bullets[:8]

    subtasks = collect_section_lines(sections, ("subtask", "task", "phase", "stage", "step", "workstream"))
    if not subtasks:
        subtasks = all_checklists[:12]

    acceptance = collect_section_lines(sections, ("acceptance", "criteria", "validation", "definition of done"))
    if not acceptance:
        acceptance = [item for item in all_checklists if item not in subtasks][:12]

    dependencies = collect_matching_lines(sections, ORDER_HINT_RE)
    non_functional = collect_matching_lines(sections, NON_FUNCTIONAL_RE)
    cross_subtask = collect_matching_lines(sections, CROSS_HINT_RE)

    result = {
        "feature_goals": goals,
        "subtasks": subtasks,
        "acceptance_criteria": acceptance,
        "dependency_candidates": dependencies,
        "non_functional_expectations": non_functional,
        "cross_subtask_validation_items": cross_subtask,
        "section_titles": [str(section["title"]) for section in sections if str(section["title"]) != "Preamble"],
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
