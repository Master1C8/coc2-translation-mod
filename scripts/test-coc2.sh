#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
if [[ "${1:-}" == "--quiet" ]]; then
  [[ "$#" == "1" ]] || { echo "Usage: test-coc2.sh [--quiet]" >&2; exit 2; }
  export VNREVIVAL_TEST_QUIET=1
elif [[ "$#" != "0" ]]; then
  echo "Usage: test-coc2.sh [--quiet]" >&2
  exit 2
fi
VNREVIVAL_GAME=coc2 exec "$ROOT/scripts/test.sh"
