#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


def load_state(path: Path) -> dict[str, object]:
    if not path.exists():
        return {"subtasks": {}, "metadata": {}}
    return json.loads(path.read_text(encoding="utf-8"))


def save_state(path: Path, state: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Maintain compact coordinator run state.")
    parser.add_argument("state_path", help="Path to the JSON state file.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_parser = subparsers.add_parser("init")
    init_parser.add_argument("--plan-path")
    init_parser.add_argument("--coordination-branch")
    init_parser.add_argument("--subtask", action="append", default=[])

    set_subtask = subparsers.add_parser("set-subtask")
    set_subtask.add_argument("subtask_id")
    set_subtask.add_argument("--status")
    set_subtask.add_argument("--stage")
    set_subtask.add_argument("--artifact-dir")
    set_subtask.add_argument("--worktree")
    set_subtask.add_argument("--branch")
    set_subtask.add_argument("--merge-status")
    set_subtask.add_argument("--remediation-count", type=int)

    set_meta = subparsers.add_parser("set-meta")
    set_meta.add_argument("key")
    set_meta.add_argument("value")

    subparsers.add_parser("show")

    args = parser.parse_args()
    state_path = Path(args.state_path)
    state = load_state(state_path)

    if args.command == "init":
        subtasks = {
            subtask_id: {
                "status": "pending",
                "stage": None,
                "artifact_dir": None,
                "worktree": None,
                "branch": None,
                "merge_status": "not-started",
                "remediation_count": 0,
            }
            for subtask_id in args.subtask
        }
        state = {
            "metadata": {
                "plan_path": args.plan_path,
                "coordination_branch": args.coordination_branch,
            },
            "subtasks": subtasks,
        }
        save_state(state_path, state)
    elif args.command == "set-subtask":
        subtasks = state.setdefault("subtasks", {})
        assert isinstance(subtasks, dict)
        entry = subtasks.setdefault(args.subtask_id, {})
        assert isinstance(entry, dict)
        for key in ["status", "stage", "artifact_dir", "worktree", "branch", "merge_status", "remediation_count"]:
            value = getattr(args, key)
            if value is not None:
                entry[key] = value
        save_state(state_path, state)
    elif args.command == "set-meta":
        metadata = state.setdefault("metadata", {})
        assert isinstance(metadata, dict)
        metadata[args.key] = args.value
        save_state(state_path, state)

    print(json.dumps(state, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
