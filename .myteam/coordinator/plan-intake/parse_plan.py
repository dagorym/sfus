#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


PROMPT_PREFIX = "Your role is 'implementer'. Your task is as follows:"
STABLE_ID_PATTERN = re.compile(r"\b[A-Za-z]+-\d+\b")
SECURITY_MARKER = re.compile(r"(?im)^\s*security review:\s*required\b")

# A subtask section heading looks like `### FU3-1 — <title>`: a stable id token
# followed by a title separator. Prompt-block headings (`### FU3-1 prompt`) and
# bare reference headings (`### PF-1`) are intentionally NOT subtasks, and
# cross-references in prose/tables (`D-5`, `C-7`, `axis-2`) must not be counted.
SUBTASK_HEADING_RE = re.compile(r"^#{2,4}\s+([A-Za-z][A-Za-z0-9]*-\d+)\b(.*)$")
SUBTASK_TITLE_SEPARATORS = ("—", "–", "-", ":")  # em dash, en dash, hyphen, colon

# A prompt block sits under a `### <ID> prompt` heading. Keying prompts to the
# nearest preceding such heading is deterministic and immune to cross-reference
# ids appearing inside a prompt body (which broke substring-based association,
# mis-targeting the Security stage).
PROMPT_HEADING_RE = re.compile(r"(?m)^#{2,4}\s+([A-Za-z][A-Za-z0-9]*-\d+)\s+prompt\s*$")


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def extract_section(text: str, title: str) -> str:
    pattern = re.compile(
        rf"^## {re.escape(title)}\s*$\n(.*?)(?=^## |\Z)",
        re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(text)
    return match.group(1).strip() if match else ""


def extract_output_artifact_path(text: str) -> str | None:
    section = extract_section(text, "Output Artifact Path")
    for line in section.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        md_link = re.search(r"\((/[^)]+|[^)]+)\)", stripped)
        if md_link:
            return md_link.group(1)
        return stripped
    return None


def extract_subtask_ids(text: str) -> list[str]:
    """Extract subtask identifiers from subtask *section headings* only.

    Anchoring on `### <ID> — <title>` headings excludes cross-references in
    prose/tables (``D-5``, ``C-7``, ``axis-2``), prompt-block headings
    (``### FU3-1 prompt``), and bare reference headings (``### PF-1``). If no
    conforming subtask heading is found, fall back to the legacy whole-text scan
    so a differently-formatted plan is not misreported as having no subtasks.
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
        ids = STABLE_ID_PATTERN.findall(text)
    return list(dict.fromkeys(ids))


def extract_dependency_lines(text: str) -> list[str]:
    section = extract_section(text, "Dependency Ordering")
    return [line.strip() for line in section.splitlines() if line.strip()]


def extract_parallelizable_ids(text: str, subtask_ids: list[str]) -> list[str]:
    section = extract_section(text, "Dependency Ordering")
    parallelizable: list[str] = []
    for subtask_id in subtask_ids:
        pattern = re.compile(rf"(?im)^.*\b{re.escape(subtask_id)}\b.*parallel")
        if pattern.search(section):
            parallelizable.append(subtask_id)
    return parallelizable


def split_prompt_blocks(text: str) -> list[str]:
    indices = [match.start() for match in re.finditer(re.escape(PROMPT_PREFIX), text)]
    blocks: list[str] = []
    for index, start in enumerate(indices):
        end = indices[index + 1] if index + 1 < len(indices) else len(text)
        block = text[start:end]
        # Prompts are wrapped in ``` fences; the body ends at its closing fence.
        # Truncate there so the next `### <ID> prompt` heading and fence markers
        # do not bleed into this prompt body.
        block = re.split(r"(?m)^\s*```\s*$", block, maxsplit=1)[0]
        # Fallback for an unfenced prompt: stop at the next level-2 section.
        block = re.split(r"\n## [^\n]+", block, maxsplit=1)[0].strip()
        blocks.append(block)
    return blocks


def associate_prompts(text: str, subtask_ids: list[str], prompt_blocks: list[str]) -> dict[str, str]:
    """Key each fenced prompt block to its subtask id.

    The plan places every prompt under a `### <ID> prompt` heading, so map each
    prompt to the id of the nearest preceding such heading — deterministic and
    immune to cross-reference ids inside a prompt body. Fall back to positional
    pairing with ``subtask_ids`` only when a prompt has no preceding heading.
    """
    heading_ids = [(match.start(), match.group(1)) for match in PROMPT_HEADING_RE.finditer(text)]
    prefix_starts = [match.start() for match in re.finditer(re.escape(PROMPT_PREFIX), text)]
    fallback_ids = list(subtask_ids)
    by_id: dict[str, str] = {}

    for block, start in zip(prompt_blocks, prefix_starts):
        heading_id = None
        for heading_start, candidate in heading_ids:
            if heading_start < start:
                heading_id = candidate
            else:
                break
        if heading_id is None:
            heading_id = fallback_ids.pop(0) if fallback_ids else f"subtask-{len(by_id) + 1}"
        by_id[heading_id] = block

    return by_id


def build_result(plan_path: Path) -> dict[str, object]:
    text = read_text(plan_path)
    subtask_ids = extract_subtask_ids(text)
    dependency_lines = extract_dependency_lines(text)
    prompt_blocks = split_prompt_blocks(text)
    prompts_by_subtask = associate_prompts(text, subtask_ids, prompt_blocks)
    security_required = [
        subtask_id
        for subtask_id, block in prompts_by_subtask.items()
        if SECURITY_MARKER.search(block)
    ]

    return {
        "plan_path": plan_path.as_posix(),
        "output_artifact_path": extract_output_artifact_path(text),
        "subtask_ids": subtask_ids,
        "dependency_lines": dependency_lines,
        "parallelizable_subtask_ids": extract_parallelizable_ids(text, subtask_ids),
        "security_required_subtask_ids": security_required,
        "implementer_prompt_count": len(prompt_blocks),
        "implementer_prompts_by_subtask": prompts_by_subtask,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Parse a planner plan artifact into coordinator-friendly JSON.")
    parser.add_argument("plan_path", help="Path to the plan markdown artifact.")
    args = parser.parse_args()

    plan_path = Path(args.plan_path)
    result = build_result(plan_path)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
