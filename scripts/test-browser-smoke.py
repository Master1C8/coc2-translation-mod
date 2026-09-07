#!/usr/bin/env python3
"""Run the browser smoke fixture and wait for its PASS/FAIL page title."""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request


ROOT = Path(__file__).resolve().parents[1]


def find_browser() -> str | None:
    configured = os.environ.get("VNREVIVAL_CHROME", "").strip()
    candidates = [
        configured,
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        shutil.which("google-chrome") or "",
        shutil.which("chromium") or "",
        shutil.which("chromium-browser") or "",
    ]
    return next((candidate for candidate in candidates if candidate and Path(candidate).is_file()), None)


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def main() -> int:
    browser = find_browser()
    if not browser:
        print("Browser smoke: SKIP (Chrome/Chromium not found)")
        return 0
    fixture = ROOT / "tests/runtime-smoke.html"
    if not (ROOT / ".build/languages.js").is_file() or not (ROOT / ".build/game-config.js").is_file() or not (ROOT / ".build/openai-config.js").is_file():
        print("Browser smoke: generated configs are missing", file=sys.stderr)
        return 1
    port = free_port()
    with tempfile.TemporaryDirectory(prefix="vnrevival-browser-smoke-") as profile:
        log_path = Path(profile) / "chrome.log"
        with log_path.open("wb") as log:
            process = subprocess.Popen(
                [
                    browser,
                    "--headless=new",
                    "--disable-background-networking",
                    "--disable-gpu",
                    "--no-first-run",
                    "--no-sandbox",
                    "--allow-file-access-from-files",
                    "--remote-debugging-address=127.0.0.1",
                    f"--remote-debugging-port={port}",
                    f"--user-data-dir={profile}",
                    fixture.resolve().as_uri(),
                ],
                stdout=subprocess.DEVNULL,
                stderr=log,
            )
            try:
                deadline = time.monotonic() + 25
                last_title = ""
                while time.monotonic() < deadline:
                    if process.poll() is not None:
                        break
                    try:
                        with urllib.request.urlopen(
                            f"http://127.0.0.1:{port}/json/list", timeout=1
                        ) as response:
                            targets = json.load(response)
                        for target in targets if isinstance(targets, list) else []:
                            if target.get("url") == fixture.resolve().as_uri():
                                last_title = str(target.get("title") or "")
                                if last_title == "PASS":
                                    print("Browser smoke: PASS")
                                    return 0
                                if last_title == "FAIL" or last_title.startswith("FAIL: "):
                                    print(f"Browser smoke: {last_title[:600]}", file=sys.stderr)
                                    return 1
                    except (OSError, ValueError, urllib.error.URLError):
                        pass
                    time.sleep(0.1)
                print(f"Browser smoke: timeout (last title: {last_title or 'unavailable'})", file=sys.stderr)
                return 1
            finally:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=3)


if __name__ == "__main__":
    raise SystemExit(main())
