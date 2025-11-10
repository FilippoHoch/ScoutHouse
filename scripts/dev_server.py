#!/usr/bin/env python3
"""Simple helper to start the frontend and backend in development."""

from __future__ import annotations

import signal
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"

COMMANDS = [
    [sys.executable, "-m", "uvicorn", "app.main:app", "--reload"],
    ["npm", "run", "dev"],
]


def main() -> int:
    processes: list[subprocess.Popen[bytes]] = []

    try:
        processes.append(subprocess.Popen(COMMANDS[0], cwd=BACKEND))
        processes.append(subprocess.Popen(COMMANDS[1], cwd=FRONTEND))

        def handle_sigint(signum: int, frame: object) -> None:  # noqa: ARG001
            for proc in processes:
                proc.send_signal(signal.SIGINT)

        signal.signal(signal.SIGINT, handle_sigint)

        for proc in processes:
            proc.wait()
    finally:
        for proc in processes:
            if proc.poll() is None:
                proc.terminate()

    return 0


if __name__ == "__main__":
    sys.exit(main())
