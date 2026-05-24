#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


HEADING_RE = re.compile(r"^(#{1,6})\s+(.*\S)\s*$")


def load_lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8").splitlines()


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def parse_sections(path: Path) -> list[dict[str, object]]:
    lines = load_lines(path)
    headings: list[tuple[int, int, str]] = []
    for idx, line in enumerate(lines, start=1):
        match = HEADING_RE.match(line)
        if match:
            headings.append((idx, len(match.group(1)), match.group(2).strip()))

    sections: list[dict[str, object]] = []
    if not headings:
        sections.append(
            {
                "title": "Document",
                "level": 0,
                "start_line": 1,
                "end_line": len(lines),
                "content": "\n".join(lines),
                "parent_headings": [],
            }
        )
        return sections

    for position, (start_line, level, title) in enumerate(headings):
        end_line = len(lines)
        for next_start, next_level, _next_title in headings[position + 1 :]:
            if next_level <= level:
                end_line = next_start - 1
                break
        parent_headings = [
            candidate_title
            for candidate_start, candidate_level, candidate_title in headings[:position]
            if candidate_level < level and candidate_start < start_line
        ]
        content = "\n".join(lines[start_line - 1 : end_line])
        sections.append(
            {
                "title": title,
                "level": level,
                "start_line": start_line,
                "end_line": end_line,
                "content": content,
                "parent_headings": parent_headings[-3:],
            }
        )
    return sections


def matches_selector(title: str, selectors: list[str], exact: bool) -> bool:
    normalized_title = normalize(title)
    for selector in selectors:
        normalized_selector = normalize(selector)
        if exact:
            if normalized_title == normalized_selector:
                return True
        elif normalized_selector in normalized_title:
            return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract targeted markdown section context for proposal drafting.")
    parser.add_argument("--file", required=True, help="Markdown file to inspect.")
    parser.add_argument("--section", action="append", required=True, help="Heading text selector. Repeat for multiple sections.")
    parser.add_argument("--exact", action="store_true", help="Require exact heading matches instead of substring matches.")
    parser.add_argument("--include-untitled", action="store_true", help="Allow returning the whole document when no headings are present.")
    args = parser.parse_args()

    path = Path(args.file).resolve()
    sections = parse_sections(path)
    matches = [
        section
        for section in sections
        if matches_selector(str(section["title"]), args.section, args.exact)
    ]

    if not matches and args.include_untitled and len(sections) == 1 and str(sections[0]["title"]) == "Document":
        matches = sections

    result = {
        "path": path.as_posix(),
        "selectors": args.section,
        "exact": args.exact,
        "matches": matches,
        "available_headings": [
            {
                "title": str(section["title"]),
                "level": int(section["level"]),
                "start_line": int(section["start_line"]),
                "end_line": int(section["end_line"]),
            }
            for section in sections
        ],
        "assumption_note": "Extracted context isolates current section text and nearby hierarchy; the designer still decides how much of that context matters to the proposed edit.",
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
