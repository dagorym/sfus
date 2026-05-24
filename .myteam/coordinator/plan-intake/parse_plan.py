#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


PROMPT_PREFIX = "Your role is 'implementer'. Your task is as follows:"
STABLE_ID_PATTERN = re.compile(r"\b[A-Za-z]+-\d+\b")


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
    return list(dict.fromkeys(STABLE_ID_PATTERN.findall(text)))


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
        block = text[start:end].strip()
        block = re.split(r"\n## [^\n]+", block, maxsplit=1)[0].strip()
        blocks.append(block)
    return blocks


def associate_prompts(subtask_ids: list[str], prompt_blocks: list[str]) -> dict[str, str]:
    by_id: dict[str, str] = {}
    remaining_ids = list(subtask_ids)

    for block in prompt_blocks:
        block_ids = [subtask_id for subtask_id in remaining_ids if subtask_id in block]
        if block_ids:
            for subtask_id in block_ids:
                by_id[subtask_id] = block
                remaining_ids.remove(subtask_id)
            continue
        if remaining_ids:
            by_id[remaining_ids.pop(0)] = block

    return by_id


def build_result(plan_path: Path) -> dict[str, object]:
    text = read_text(plan_path)
    subtask_ids = extract_subtask_ids(text)
    dependency_lines = extract_dependency_lines(text)
    prompt_blocks = split_prompt_blocks(text)
    prompts_by_subtask = associate_prompts(subtask_ids, prompt_blocks)

    return {
        "plan_path": plan_path.as_posix(),
        "output_artifact_path": extract_output_artifact_path(text),
        "subtask_ids": subtask_ids,
        "dependency_lines": dependency_lines,
        "parallelizable_subtask_ids": extract_parallelizable_ids(text, subtask_ids),
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
