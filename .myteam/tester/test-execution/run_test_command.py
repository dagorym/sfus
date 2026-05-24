#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import time
from pathlib import Path


PYTEST_RE = re.compile(r"=+\s+(?P<failed>\d+)\s+failed(?:,|\s).*(?P<passed>\d+)\s+passed|=+\s+(?P<passed_only>\d+)\s+passed")
JEST_RE = re.compile(r"Tests:\s+(?:(?P<failed>\d+)\s+failed,\s+)?(?P<passed>\d+)\s+passed,\s+(?P<total>\d+)\s+total")


def parse_counts(output: str) -> dict[str, object]:
    for regex, framework in ((PYTEST_RE, "pytest"), (JEST_RE, "jest")):
        match = regex.search(output)
        if not match:
            continue
        groups = match.groupdict()
        passed = groups.get("passed") or groups.get("passed_only") or "0"
        failed = groups.get("failed") or "0"
        total = groups.get("total")
        if total is None:
            total = str(int(passed) + int(failed))
        return {
            "framework": framework,
            "passed": int(passed),
            "failed": int(failed),
            "total": int(total),
        }
    return {
        "framework": None,
        "passed": None,
        "failed": None,
        "total": None,
    }


def write_text(path: Path | None, content: str) -> str | None:
    if path is None:
        return None
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return str(path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a test command and return normalized execution details.")
    parser.add_argument("--repo-root", default=".", help="Repository root or working directory.")
    parser.add_argument("--stdout-log", help="Optional path for captured stdout.")
    parser.add_argument("--stderr-log", help="Optional path for captured stderr.")
    parser.add_argument("--timeout-sec", type=int, default=0, help="Optional timeout in seconds. 0 disables the timeout.")
    parser.add_argument("command", nargs=argparse.REMAINDER, help="Command to run. Prefix with -- before the command.")
    args = parser.parse_args()

    command = list(args.command)
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        raise SystemExit("No command provided. Pass the test command after --.")

    repo_root = Path(args.repo_root).resolve()
    stdout_log = Path(args.stdout_log) if args.stdout_log else None
    stderr_log = Path(args.stderr_log) if args.stderr_log else None
    timeout = args.timeout_sec if args.timeout_sec > 0 else None

    start = time.monotonic()
    timed_out = False
    try:
        completed = subprocess.run(
            command,
            cwd=repo_root,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        stdout_text = completed.stdout
        stderr_text = completed.stderr
        return_code = completed.returncode
    except subprocess.TimeoutExpired as exc:
        timed_out = True
        stdout_text = exc.stdout or ""
        stderr_text = exc.stderr or ""
        return_code = 124
    duration_sec = time.monotonic() - start

    stdout_path = write_text(stdout_log, stdout_text)
    stderr_path = write_text(stderr_log, stderr_text)
    counts = parse_counts(f"{stdout_text}\n{stderr_text}")

    result = {
        "command": command,
        "cwd": str(repo_root),
        "exit_code": return_code,
        "timed_out": timed_out,
        "duration_sec": round(duration_sec, 3),
        "stdout_log": stdout_path,
        "stderr_log": stderr_path,
        "stdout_excerpt": stdout_text[-4000:],
        "stderr_excerpt": stderr_text[-4000:],
        "best_effort_counts": counts,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
