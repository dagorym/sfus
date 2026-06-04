#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

STOP_WORDS = {
    "a", "an", "the", "and", "or", "of", "in", "for", "with", "to",
    "on", "at", "by", "from", "as", "is", "are", "be", "this", "that",
    "it", "its", "their", "they", "we", "our", "your", "not", "but",
    "if", "when", "how", "what", "which", "who", "all", "any", "each",
    "no", "only", "so", "than", "then", "there", "these", "those",
}

HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)


def extract_sections(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    sections = []
    matches = list(HEADING_RE.finditer(text))
    for i, m in enumerate(matches):
        heading_text = m.group(2).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        content = text[start:end].strip()
        snippet = content[:300].replace("\n", " ").strip()
        sections.append({
            "heading": heading_text,
            "level": len(m.group(1)),
            "snippet": snippet,
        })
    return sections


def normalize_heading(heading: str) -> set[str]:
    words = re.findall(r"[a-z]+", heading.lower())
    return {w for w in words if w not in STOP_WORDS and len(w) > 2}


def find_candidates(doc_sections: dict[str, list[dict]]) -> list[dict]:
    doc_names = list(doc_sections.keys())
    candidates = []
    seen: set[tuple] = set()
    for i in range(len(doc_names)):
        for j in range(i + 1, len(doc_names)):
            doc_a, doc_b = doc_names[i], doc_names[j]
            for sec_a in doc_sections[doc_a]:
                words_a = normalize_heading(sec_a["heading"])
                if not words_a:
                    continue
                for sec_b in doc_sections[doc_b]:
                    words_b = normalize_heading(sec_b["heading"])
                    overlap = words_a & words_b
                    exact = sec_a["heading"].lower() == sec_b["heading"].lower()
                    if len(overlap) >= 2 or exact:
                        key = (doc_a, sec_a["heading"], doc_b, sec_b["heading"])
                        if key in seen:
                            continue
                        seen.add(key)
                        topic = " / ".join(sorted(overlap)) if overlap else sec_a["heading"]
                        candidates.append({
                            "topic": topic,
                            "matches": [
                                {
                                    "document": doc_a,
                                    "heading": sec_a["heading"],
                                    "snippet": sec_a["snippet"],
                                },
                                {
                                    "document": doc_b,
                                    "heading": sec_b["heading"],
                                    "snippet": sec_b["snippet"],
                                },
                            ],
                        })
    return candidates


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Surface candidate cross-document contradictions in design docs."
    )
    parser.add_argument(
        "--docs", nargs="+", required=True, help="Paths to design documents to compare."
    )
    args = parser.parse_args()

    paths = [Path(p) for p in args.docs]
    missing = [p for p in paths if not p.exists()]
    if missing:
        print(json.dumps({"error": f"Files not found: {[str(p) for p in missing]}"}))
        return 1

    if len(paths) == 1:
        print(
            json.dumps(
                {
                    "single_document": True,
                    "documents_checked": [str(paths[0])],
                    "candidate_contradictions": [],
                    "note": "Single document — no cross-document contradiction check needed.",
                },
                indent=2,
            )
        )
        return 0

    doc_sections = {str(p): extract_sections(p) for p in paths}
    candidates = find_candidates(doc_sections)

    print(
        json.dumps(
            {
                "single_document": False,
                "documents_checked": [str(p) for p in paths],
                "candidate_contradictions": candidates,
                "note": (
                    "Candidates are heuristic matches by heading keyword overlap. "
                    "Review each pair for actual logical contradictions rather than "
                    "reading full documents simultaneously."
                ),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
