#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


GUIDANCE_FILES = ("AGENTS.md",)
MYTEAM_EXTENSIONS = (".md",)

SECTION_PATTERNS = [
    re.compile(r"^#+\s+Function Comments\s*$", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^#+\s+Docstrings?\s*$", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^#+\s+Doxygen\s*$", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^#+\s+Documentation(?:\s+Comments)?\s*$", re.IGNORECASE | re.MULTILINE),
]

KEYWORD_RULES = {
    "function_comments": [
        "function comments",
        "doxygen",
        "docstring",
        "file headers",
        "last modified",
        "@author",
        "@date",
    ],
}


def find_repo_root(start: Path) -> Path:
    current = start.resolve()
    for candidate in [current, *current.parents]:
        if (candidate / ".git").exists():
            return candidate
    return current


def candidate_guidance_files(repo_root: Path) -> list[Path]:
    files: list[Path] = []
    for rel in GUIDANCE_FILES:
        path = repo_root / rel
        if path.exists():
            files.append(path)
    myteam_root = repo_root / ".myteam"
    if myteam_root.exists():
        for path in myteam_root.rglob("*"):
            if path.is_file() and path.suffix in MYTEAM_EXTENSIONS:
                files.append(path)
    return files


def extract_matching_lines(text: str, keywords: list[str]) -> list[str]:
    matches: list[str] = []
    for line in text.splitlines():
        lower = line.lower()
        if any(keyword in lower for keyword in keywords):
            matches.append(line.strip())
    return matches


def main() -> int:
    parser = argparse.ArgumentParser(description="Scan repository guidance for in-code documentation requirements.")
    parser.add_argument("--root", default=".", help="Repository root or starting path.")
    args = parser.parse_args()

    repo_root = find_repo_root(Path(args.root))
    files = candidate_guidance_files(repo_root)

    matched_files: list[dict[str, object]] = []
    all_matches: list[str] = []
    for path in files:
        text = path.read_text(encoding="utf-8", errors="ignore")
        section_hit = any(pattern.search(text) for pattern in SECTION_PATTERNS)
        keyword_hits = extract_matching_lines(text, KEYWORD_RULES["function_comments"])
        if section_hit or keyword_hits:
            rel = path.relative_to(repo_root).as_posix()
            matched_files.append(
                {
                    "path": rel,
                    "section_match": section_hit,
                    "keyword_matches": keyword_hits[:20],
                }
            )
            all_matches.extend(keyword_hits)

    normalized_text = "\n".join(all_matches).lower()
    result = {
        "repo_root": str(repo_root),
        "guidance_files_scanned": [path.relative_to(repo_root).as_posix() for path in files],
        "matched_guidance_files": matched_files,
        "requirements": {
            "in_code_documentation_required": bool(matched_files),
            "function_comments_likely_required": "function comments" in normalized_text or any(
                item.get("section_match") for item in matched_files
            ),
            "docblocks_or_docstrings_likely_required": any(
                token in normalized_text for token in ["doxygen", "docstring", "file headers"]
            ),
            "author_metadata_likely_required": "@author" in normalized_text,
            "last_modified_metadata_likely_required": "last modified" in normalized_text or "@date" in normalized_text,
        },
        "note": "Use these results as repository-policy evidence for documentation scope inside changed product files. Final applicability still depends on the actual diff.",
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
