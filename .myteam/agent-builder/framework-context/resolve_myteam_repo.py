#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path


DEFAULT_REPO = Path("~/repos/myteam").expanduser()


def main() -> int:
    exists = DEFAULT_REPO.exists()
    is_git_repo = (DEFAULT_REPO / ".git").exists() if exists else False
    result = {
        "default_repo_path": str(DEFAULT_REPO),
        "exists": exists,
        "is_git_repo": is_git_repo,
        "usable": exists and is_git_repo,
        "prompt_user_for_location": not (exists and is_git_repo),
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
