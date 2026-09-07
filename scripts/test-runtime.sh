#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
cd "$ROOT"
QUIET=0
UNIT_ONLY=0
for ARG in "$@"; do
  case "$ARG" in
    --quiet) QUIET=1 ;;
    --unit-only) UNIT_ONLY=1 ;;
    *) echo "Unknown test option: $ARG" >&2; exit 2 ;;
  esac
done
NODE_ARGS=(--test)
[[ "$QUIET" == "1" ]] && NODE_ARGS+=(--test-reporter=dot)
mkdir -p .build
python3 scripts/generate-languages-js.py src/languages.json .build/languages.js
python3 scripts/generate-openai-config.py src/openai-compatible.json .build/openai-config.js
python3 scripts/generate-game-config.py src/games/coc2/game.json .build/game-config.js
VNREVIVAL_GAME=coc2 node "${NODE_ARGS[@]}" \
  tests/smoke-report.test.js tests/translation-core.test.js tests/providers.test.js tests/languages.test.js \
  tests/game-adapter.test.js src/games/coc2/tests/adapter.test.js
if [[ "$UNIT_ONLY" == "0" ]]; then
  ./scripts/test-browser-smoke.sh
fi
