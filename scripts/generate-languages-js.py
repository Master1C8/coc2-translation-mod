#!/usr/bin/env python3
"""Generate the browser language catalog from its canonical JSON source."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: generate-languages-js.py <languages.json> <output.js>", file=sys.stderr)
        return 2
    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    languages = json.loads(source.read_text(encoding="utf-8"))
    if not isinstance(languages, list) or len(languages) != 31:
        raise ValueError("the language catalog must contain exactly 31 entries")
    seen: set[str] = set()
    for entry in languages:
        if not isinstance(entry, list) or len(entry) != 3 or not all(
            isinstance(value, str) and value for value in entry
        ):
            raise ValueError("every language entry must contain code, English name, and native name")
        if entry[0] in seen:
            raise ValueError(f"duplicate language code: {entry[0]}")
        seen.add(entry[0])
    payload = json.dumps(languages, ensure_ascii=True, separators=(",", ":"))
    output.write_text(
        "(function(root){\n"
        f"  root.VNRevivalTranslatorLanguages = Object.freeze({payload}.map(Object.freeze));\n"
        "})(typeof globalThis !== \"undefined\" ? globalThis : this);\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
