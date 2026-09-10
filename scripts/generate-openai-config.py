#!/usr/bin/env python3
"""Generate an immutable browser config from openai-compatible.json."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: generate-openai-config.py <config.json> <output.js>", file=sys.stderr)
        return 2
    config = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    required = {
        "promptVersion", "maxSystemPromptChars", "maxGlossaryChars",
        "maxRequestSystemPromptChars", "minConcurrency", "maxConcurrency",
        "reasoningEfforts", "verbosities", "translationVerbosity", "manualModelValue",
        "defaultSystemPrompt", "presets", "openCodeChatModels", "openCodeResponseModels",
        "openCodeMessageModels", "modelReasoningEfforts",
    }
    if not isinstance(config, dict) or set(config) != required:
        raise ValueError("the OpenAI-compatible config has an invalid shape")
    if list(config["presets"]) != [
        "opencode-go", "opencode-zen", "openrouter", "deepseek", "lmstudio", "custom"
    ]:
        raise ValueError("the OpenAI-compatible presets have an invalid order")
    payload = json.dumps(config, ensure_ascii=True, separators=(",", ":"))
    Path(sys.argv[2]).write_text(
        "(function(root){\n"
        "  function deepFreeze(value){\n"
        "    if (!value || typeof value !== \"object\" || Object.isFrozen(value)) return value;\n"
        "    Object.values(value).forEach(deepFreeze);\n"
        "    return Object.freeze(value);\n"
        "  }\n"
        f"  root.VNRevivalOpenAICompatibleConfig = deepFreeze({payload});\n"
        "})(typeof globalThis !== \"undefined\" ? globalThis : this);\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
