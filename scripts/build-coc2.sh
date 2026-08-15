#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
VNREVIVAL_GAME=coc2 exec "$ROOT/scripts/build.sh"
