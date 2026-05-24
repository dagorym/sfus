#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def load_paths(path: str | None) -> list[str]:
    if path:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
    else:
        payload = json.loads(sys.stdin.read())

    if isinstance(payload, dict):
        values = payload.get("changed_files", [])
    else:
        values = payload
    if not isinstance(values, list):
        raise SystemExit("Input must be a JSON list or an object with changed_files.")
    return [str(item) for item in values]


def classify(path: str) -> str:
    if path == "AGENTS.md":
        return "bootstrap-guidance"
    if path.startswith(".myteam/"):
        return "runtime-guidance"
    if path.startswith("docs/") or Path(path).name.lower().startswith("readme"):
        return "documentation"
    return "non-guidance"


def main() -> int:
    parser = argparse.ArgumentParser(description="Classify changed files for documenter guidance review.")
    parser.add_argument("--input", help="Path to JSON input. Defaults to stdin.")
    args = parser.parse_args()

    changed_files = load_paths(args.input)
    classifications = {path: classify(path) for path in changed_files}
    result = {
        "changed_files": changed_files,
        "classifications": classifications,
        "review_agenda": {
            "bootstrap_guidance_review_likely": any(value == "bootstrap-guidance" for value in classifications.values()),
            "runtime_guidance_review_likely": any(value == "runtime-guidance" for value in classifications.values()),
            "documentation_only_change": bool(changed_files) and all(value == "documentation" for value in classifications.values()),
        },
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
