#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


def parse_simple_yaml(path: Path) -> dict[str, object]:
    data: dict[str, object] = {}
    stack: list[tuple[int, dict[str, object]]] = [(-1, data)]

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        if not raw_line.strip() or raw_line.lstrip().startswith("#"):
            continue

        indent = len(raw_line) - len(raw_line.lstrip(" "))
        key, _, value = raw_line.strip().partition(":")
        value = value.strip()

        while stack and indent <= stack[-1][0]:
            stack.pop()

        parent = stack[-1][1]
        if not value:
            child: dict[str, object] = {}
            parent[key] = child
            stack.append((indent, child))
            continue

        if value.startswith(("'", '"')) and value.endswith(("'", '"')):
            value = value[1:-1]
        parent[key] = value

    return data


def load_yaml(path: Path) -> dict[str, object]:
    try:
        import yaml  # type: ignore
    except Exception:
        return parse_simple_yaml(path)

    loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
    return loaded if isinstance(loaded, dict) else {}


def resolve_source(repo_root: Path) -> Path:
    local = repo_root / "config" / "subagent-models.yaml"
    if local.exists():
        return local
    return repo_root / ".myteam" / "coordinator" / "model-selection" / "default-subagent-models.yaml"


def resolve_roles(data: dict[str, object], roles: list[str]) -> dict[str, dict[str, str] | None]:
    role_map = data.get("roles", {})
    if not isinstance(role_map, dict):
        role_map = {}

    result: dict[str, dict[str, str] | None] = {}
    for role in roles:
        entry = role_map.get(role)
        if isinstance(entry, dict):
            model = entry.get("model")
            reasoning = entry.get("reasoning_effort")
            result[role] = {
                "model": str(model) if model is not None else "",
                "reasoning_effort": str(reasoning) if reasoning is not None else "",
            }
        else:
            result[role] = None
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Resolve downstream coordinator model selections.")
    parser.add_argument("--repo-root", default=".", help="Repository root.")
    parser.add_argument("roles", nargs="+", help="Downstream role ids to resolve.")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    source = resolve_source(repo_root)
    data = load_yaml(source)
    result = {
        "model_source_path": source.relative_to(repo_root).as_posix(),
        "roles": resolve_roles(data, args.roles),
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
