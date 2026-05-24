#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re


def normalize_segment(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def normalize_path(raw: str) -> str:
    parts = [normalize_segment(part) for part in raw.replace("\\", "/").split("/")]
    cleaned = [part for part in parts if part]
    if not cleaned:
        raise SystemExit("Could not derive a non-empty target path.")
    return "/".join(cleaned)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Normalize a myteam node target path and derive the default instruction file."
    )
    parser.add_argument("--type", choices=["role", "skill"], required=True)
    parser.add_argument("target")
    args = parser.parse_args()

    normalized = normalize_path(args.target)
    instruction_file = "role.md" if args.type == "role" else "skill.md"
    result = {
        "node_type": args.type,
        "input": args.target,
        "target_path": normalized,
        "default_instruction_path": f".myteam/{normalized}/{instruction_file}",
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
