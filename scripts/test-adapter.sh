#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
cd "$ROOT"
mkdir -p .build
python3 scripts/generate-game-config.py src/games/coc2/game.json .build/game-config.js
VNREVIVAL_GAME=coc2 node --test tests/game-adapter.test.js src/games/coc2/tests/adapter.test.js
