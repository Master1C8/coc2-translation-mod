#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
cd "$ROOT"
mkdir -p .build
python3 scripts/generate-languages-js.py src/languages.json .build/languages.js
python3 scripts/generate-openai-config.py src/openai-compatible.json .build/openai-config.js
python3 scripts/generate-game-config.py src/games/coc2/game.json .build/game-config.js
VNREVIVAL_GAME=coc2 node --test \
  tests/translation-core.test.js tests/providers.test.js tests/languages.test.js \
  tests/game-adapter.test.js src/games/coc2/tests/adapter.test.js
./scripts/test-browser-smoke.sh
