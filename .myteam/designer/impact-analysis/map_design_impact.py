#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path


HEADING_RE = re.compile(r"^(#{1,6})\s+(.*\S)\s*$")
LINK_RE = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
WORD_RE = re.compile(r"[A-Za-z][A-Za-z0-9_-]{2,}")
STOPWORDS = {
    "about", "after", "before", "below", "between", "could", "design", "document", "from", "have", "into", "just",
    "likely", "must", "only", "other", "over", "same", "section", "should", "spec", "that", "their", "there",
    "these", "this", "through", "under", "update", "with", "would",
}


def load_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def tokenize(values: list[str]) -> list[str]:
    tokens: list[str] = []
    for value in values:
        for token in WORD_RE.findall(value.lower()):
            if token not in STOPWORDS:
                tokens.append(token)
    return list(dict.fromkeys(tokens))


def parse_sections(path: Path) -> list[dict[str, object]]:
    sections: list[dict[str, object]] = []
    current = {"title": "Preamble", "level": 0, "start_line": 1, "lines": []}
    for line_number, raw_line in enumerate(load_text(path).splitlines(), start=1):
        match = HEADING_RE.match(raw_line)
        if match:
            current["end_line"] = line_number - 1
            sections.append(current)
            current = {
                "title": match.group(2).strip(),
                "level": len(match.group(1)),
                "start_line": line_number,
                "lines": [],
            }
            continue
        current["lines"].append(raw_line.rstrip())
    current["end_line"] = current["start_line"] + len(current["lines"])
    sections.append(current)
    return sections


def score_section(title: str, lines: list[str], query_tokens: list[str], file_tokens: list[str]) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    title_lower = title.lower()
    body = "\n".join(lines).lower()

    title_hits = [token for token in query_tokens if token in title_lower]
    if title_hits:
        score += len(title_hits) * 3
        reasons.append("heading overlaps request terms")

    body_hits = [token for token in query_tokens if token in body]
    if body_hits:
        score += len(set(body_hits))
        reasons.append("section body overlaps request terms")

    file_hits = [token for token in file_tokens if token in title_lower or token in body]
    if file_hits:
        score += len(set(file_hits))
        reasons.append("section overlaps document path terms")

    if title != "Preamble" and not lines:
        score -= 1
    return score, reasons


def repeated_terms(sections: list[dict[str, object]]) -> list[dict[str, object]]:
    counts: Counter[str] = Counter()
    for section in sections:
        seen = set(tokenize([str(section["title"]), *[str(line) for line in section["lines"]]]))
        for token in seen:
            counts[token] += 1
    ranked = [
        {"term": term, "section_count": count}
        for term, count in counts.most_common()
        if count >= 2 and term not in STOPWORDS
    ]
    return ranked[:20]


def cross_references(path: Path, sections: list[dict[str, object]]) -> list[dict[str, object]]:
    refs: list[dict[str, object]] = []
    for section in sections:
        for line in section["lines"]:
            for match in LINK_RE.finditer(str(line)):
                target = match.group(1).strip()
                refs.append(
                    {
                        "source_file": path.as_posix(),
                        "section": str(section["title"]),
                        "target": target,
                    }
                )
    return refs


def main() -> int:
    parser = argparse.ArgumentParser(description="Enumerate markdown sections and rank likely impacted areas for a design change.")
    parser.add_argument("--file", action="append", required=True, help="Markdown file to analyze. Repeat for multiple documents.")
    parser.add_argument("--query", action="append", default=[], help="Request text or impact hint used to rank sections.")
    parser.add_argument("--limit", type=int, default=12, help="Maximum ranked impacted sections to return.")
    args = parser.parse_args()

    query_tokens = tokenize(args.query)
    analyzed_files: list[dict[str, object]] = []
    ranked_sections: list[dict[str, object]] = []
    all_sections: list[dict[str, object]] = []

    for raw_path in args.file:
        path = Path(raw_path).resolve()
        file_sections = parse_sections(path)
        all_sections.extend(file_sections)
        file_tokens = tokenize([path.name, path.parent.as_posix()])
        analyzed_files.append(
            {
                "path": path.as_posix(),
                "section_titles": [str(section["title"]) for section in file_sections if str(section["title"]) != "Preamble"],
                "section_count": len(file_sections),
            }
        )
        for section in file_sections:
            score, reasons = score_section(str(section["title"]), list(section["lines"]), query_tokens, file_tokens)
            if score <= 0:
                continue
            ranked_sections.append(
                {
                    "path": path.as_posix(),
                    "section": str(section["title"]),
                    "level": int(section["level"]),
                    "start_line": int(section["start_line"]),
                    "end_line": int(section["end_line"]),
                    "score": score,
                    "reasons": reasons,
                }
            )

    references: list[dict[str, object]] = []
    for raw_path in args.file:
        path = Path(raw_path).resolve()
        references.extend(cross_references(path, parse_sections(path)))

    ranked_sections.sort(key=lambda item: (-int(item["score"]), str(item["path"]), int(item["start_line"])))
    result = {
        "query_tokens": query_tokens,
        "files": analyzed_files,
        "ranked_impacted_sections": ranked_sections[: args.limit],
        "repeated_terms": repeated_terms(all_sections),
        "cross_references": references[:50],
        "assumption_note": "Section ranking is heuristic. Final impact analysis still requires editorial judgment about downstream design implications.",
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
