#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
cd "$ROOT"
PYTHONPYCACHEPREFIX="$ROOT/.build/python-cache" python3 -m unittest tests.test_local_service tests.test_service_logging
