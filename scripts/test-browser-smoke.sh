#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
cd "$ROOT"
mkdir -p .build
python3 scripts/generate-languages-js.py src/languages.json .build/languages.js
python3 scripts/generate-openai-config.py src/openai-compatible.json .build/openai-config.js
python3 scripts/generate-game-config.py src/games/coc2/game.json .build/game-config.js
python3 scripts/test-browser-smoke.py
