#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


def load_state(path: Path) -> dict[str, object]:
    if not path.exists():
        return {"open": [], "resolved": [], "current": None, "notes": {}, "affected_scope": {}}
    return json.loads(path.read_text(encoding="utf-8"))


def save_state(path: Path, state: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def normalize_open_queue(state: dict[str, object]) -> None:
    open_items = state.get("open", [])
    state["current"] = open_items[0]["id"] if open_items else None


def cmd_init(args: argparse.Namespace) -> int:
    state = {"open": [], "resolved": [], "current": None, "notes": {}, "affected_scope": {}}
    for index, title in enumerate(args.decision, start=1):
        state["open"].append({"id": f"decision-{index}", "title": title})
    normalize_open_queue(state)
    save_state(Path(args.state), state)
    print(json.dumps(state, indent=2, sort_keys=True))
    return 0


def cmd_add(args: argparse.Namespace) -> int:
    path = Path(args.state)
    state = load_state(path)
    open_items = list(state.get("open", []))
    next_index = len(open_items) + len(state.get("resolved", [])) + 1
    item = {"id": args.id or f"decision-{next_index}", "title": args.title}
    open_items.append(item)
    state["open"] = open_items
    normalize_open_queue(state)
    save_state(path, state)
    print(json.dumps(state, indent=2, sort_keys=True))
    return 0


def cmd_resolve(args: argparse.Namespace) -> int:
    path = Path(args.state)
    state = load_state(path)
    open_items = list(state.get("open", []))
    resolved_items = list(state.get("resolved", []))
    target = None
    for index, item in enumerate(open_items):
        if item["id"] == args.id:
            target = open_items.pop(index)
            break
    if target is None:
        raise SystemExit(f"Decision id not found in open queue: {args.id}")
    target["answer"] = args.answer
    if args.note:
        state.setdefault("notes", {})[args.id] = args.note
    if args.scope:
        state.setdefault("affected_scope", {})[args.id] = args.scope
    resolved_items.append(target)
    state["open"] = open_items
    state["resolved"] = resolved_items
    normalize_open_queue(state)
    save_state(path, state)
    print(json.dumps(state, indent=2, sort_keys=True))
    return 0


def cmd_show(args: argparse.Namespace) -> int:
    state = load_state(Path(args.state))
    print(json.dumps(state, indent=2, sort_keys=True))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Track planner decision-resolution state.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_parser = subparsers.add_parser("init", help="Initialize decision tracker state.")
    init_parser.add_argument("--state", required=True, help="Path to the tracker JSON file.")
    init_parser.add_argument("--decision", action="append", default=[], help="Decision title. Repeat for multiple items.")
    init_parser.set_defaults(func=cmd_init)

    add_parser = subparsers.add_parser("add", help="Add a decision to the open queue.")
    add_parser.add_argument("--state", required=True, help="Path to the tracker JSON file.")
    add_parser.add_argument("--title", required=True, help="Decision title.")
    add_parser.add_argument("--id", help="Optional stable decision identifier.")
    add_parser.set_defaults(func=cmd_add)

    resolve_parser = subparsers.add_parser("resolve", help="Resolve one decision from the open queue.")
    resolve_parser.add_argument("--state", required=True, help="Path to the tracker JSON file.")
    resolve_parser.add_argument("--id", required=True, help="Open decision identifier.")
    resolve_parser.add_argument("--answer", required=True, help="Chosen answer or approved option.")
    resolve_parser.add_argument("--note", help="Optional note about the rationale or consequence.")
    resolve_parser.add_argument("--scope", help="Optional affected scope summary.")
    resolve_parser.set_defaults(func=cmd_resolve)

    show_parser = subparsers.add_parser("show", help="Show current tracker state.")
    show_parser.add_argument("--state", required=True, help="Path to the tracker JSON file.")
    show_parser.set_defaults(func=cmd_show)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
