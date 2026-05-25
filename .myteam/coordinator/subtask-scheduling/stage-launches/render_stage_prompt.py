#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


WRAPPER_LINES = [
    "You must complete the full agent workflow; do not stop after activation output.",
    "Do not stop after activation metadata; continue through the entire agent workflow, artifact writing, and commit handling.",
]


def read_body(path: Path) -> str:
    return path.read_text(encoding="utf-8").strip()


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepend coordinator wrapper lines to a stage prompt artifact.")
    parser.add_argument("prompt_path", help="Path to the substantive downstream prompt.")
    args = parser.parse_args()

    body = read_body(Path(args.prompt_path))
    print("\n".join([*WRAPPER_LINES, "", body]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
