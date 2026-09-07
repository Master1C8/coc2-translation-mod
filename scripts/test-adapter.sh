#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
cd "$ROOT"
QUIET=0
for ARG in "$@"; do
  case "$ARG" in
    --quiet) QUIET=1 ;;
    *) echo "Unknown test option: $ARG" >&2; exit 2 ;;
  esac
done
NODE_ARGS=(--test)
[[ "$QUIET" == "1" ]] && NODE_ARGS+=(--test-reporter=dot)
mkdir -p .build
python3 scripts/generate-game-config.py src/games/coc2/game.json .build/game-config.js
VNREVIVAL_GAME=coc2 node "${NODE_ARGS[@]}" tests/game-adapter.test.js src/games/coc2/tests/adapter.test.js
