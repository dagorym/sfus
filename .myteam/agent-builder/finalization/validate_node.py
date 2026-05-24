#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a myteam role or skill node.")
    parser.add_argument("--root", default=".myteam")
    parser.add_argument("--type", choices=["role", "skill"], required=True)
    parser.add_argument("--target", required=True)
    args = parser.parse_args()

    root = Path(args.root)
    parts = args.target.split("/")
    node_dir = root.joinpath(*parts)
    expected_instruction = "role.md" if args.type == "role" else "skill.md"
    parent_paths = [root.joinpath(*parts[:index]) for index in range(1, len(parts))]

    result = {
        "node_type": args.type,
        "target_path": args.target,
        "node_dir": node_dir.as_posix(),
        "node_exists": node_dir.is_dir(),
        "expected_instruction": expected_instruction,
        "instruction_exists": (node_dir / expected_instruction).exists(),
        "load_py_exists": (node_dir / "load.py").exists(),
        "missing_parent_nodes": [path.as_posix() for path in parent_paths if not path.exists()],
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
