#!/bin/zsh
set -eu

CROSSOVER_APP="${VNREVIVAL_CROSSOVER_APP:-/Applications/CrossOver.app}"
BOTTLES_ROOT="${VNREVIVAL_CROSSOVER_BOTTLES_DIR:-$HOME/Library/Application Support/CrossOver/Bottles}"
GAME_EXECUTABLE="CoC II.exe"
GAME_PATH_FILE="$HOME/Library/Application Support/VN Revival/Translator Paths/coc2.txt"
DEFAULT_TRANSLATOR_APP="${0:A:h:h}/.build/macos/CoC2 Translator.app"

usage() {
  print -r -- "Usage: ${0:t} [--print]"
  print -r -- ""
  print -r -- "Find the newest installed CoC2 version and start it with CoC2 Translator through CrossOver."
  print -r -- "With --print, show the selected installation without launching it."
}

version_key() {
  local version="$1"
  local key=""
  local part
  local -a parts
  parts=("${(@s:.:)version}")
  (( ${#parts} >= 1 && ${#parts} <= 6 )) || return 1
  for part in "${parts[@]}"; do
    [[ "$part" == <-> ]] || return 1
    printf -v key '%s%09d' "$key" "$((10#$part))"
  done
  while (( ${#key} < 54 )); do
    key+="000000000"
  done
  print -r -- "$key"
}

PRINT_ONLY=0
case "${1:-}" in
  "") ;;
  --print) PRINT_ONLY=1 ;;
  --help|-h)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
(( $# <= 1 )) || {
  usage >&2
  exit 2
}

if [[ ! -d "$BOTTLES_ROOT" ]]; then
  print -u2 -r -- "CrossOver bottles were not found: $BOTTLES_ROOT"
  exit 1
fi

if [[ -n "${VNREVIVAL_TRANSLATOR_APP:-}" ]]; then
  TRANSLATOR_APP="$VNREVIVAL_TRANSLATOR_APP"
elif [[ -d "$DEFAULT_TRANSLATOR_APP" ]]; then
  TRANSLATOR_APP="$DEFAULT_TRANSLATOR_APP"
elif [[ -d "/Applications/CoC2 Translator.app" ]]; then
  TRANSLATOR_APP="/Applications/CoC2 Translator.app"
elif [[ -d "$HOME/Applications/CoC2 Translator.app" ]]; then
  TRANSLATOR_APP="$HOME/Applications/CoC2 Translator.app"
else
  print -u2 -r -- "CoC2 Translator.app was not found. Build it with ./scripts/build-coc2.sh or set VNREVIVAL_TRANSLATOR_APP."
  exit 1
fi

TRANSLATOR_LAUNCHER="$TRANSLATOR_APP/Contents/MacOS/CoC2 Translator"
if [[ ! -x "$TRANSLATOR_LAUNCHER" ]]; then
  print -u2 -r -- "The CoC2 Translator launcher is missing: $TRANSLATOR_LAUNCHER"
  exit 1
fi

BEST_EXE=""
BEST_BOTTLE=""
BEST_VERSION=""
BEST_VERSION_KEY=""
BEST_MTIME=0

while IFS= read -r -d '' candidate; do
  relative_path="${candidate#$BOTTLES_ROOT/}"
  bottle="${relative_path%%/*}"
  [[ -n "$bottle" && "$bottle" != "$relative_path" ]] || continue

  candidate_mtime=$(/usr/bin/stat -f '%m' "$candidate" 2>/dev/null || print 0)
  manifest="${candidate:h}/resources/app/package.json"
  candidate_version=""
  candidate_key=""
  if [[ -f "$manifest" ]]; then
    candidate_version=$(/usr/bin/plutil -extract version raw -o - "$manifest" 2>/dev/null || true)
    candidate_key=$(version_key "$candidate_version" 2>/dev/null || true)
  fi

  select_candidate=0
  if [[ -n "$candidate_key" ]]; then
    if [[ -z "$BEST_VERSION_KEY" || "$candidate_key" > "$BEST_VERSION_KEY" ]]; then
      select_candidate=1
    elif [[ "$candidate_key" == "$BEST_VERSION_KEY" ]] && (( candidate_mtime > BEST_MTIME )); then
      select_candidate=1
    fi
  elif [[ -z "$BEST_VERSION_KEY" ]] && (( candidate_mtime > BEST_MTIME )); then
    select_candidate=1
  fi

  if (( select_candidate )); then
    BEST_EXE="$candidate"
    BEST_BOTTLE="$bottle"
    BEST_VERSION="$candidate_version"
    BEST_VERSION_KEY="$candidate_key"
    BEST_MTIME="$candidate_mtime"
  fi
done < <(/usr/bin/find "$BOTTLES_ROOT" -type f -iname "$GAME_EXECUTABLE" -print0 2>/dev/null)

if [[ -z "$BEST_EXE" ]]; then
  print -u2 -r -- "No $GAME_EXECUTABLE installation was found in CrossOver bottles."
  exit 1
fi

print -r -- "Bottle: $BEST_BOTTLE"
print -r -- "Version: ${BEST_VERSION:-unknown}"
print -r -- "Executable: $BEST_EXE"
print -r -- "Translator: $TRANSLATOR_APP"

if (( PRINT_ONLY )); then
  exit 0
fi

if [[ ! -x "$CROSSOVER_APP/Contents/SharedSupport/CrossOver/bin/wine" ]]; then
  print -u2 -r -- "CrossOver was not found: $CROSSOVER_APP"
  exit 1
fi

/bin/mkdir -p "${GAME_PATH_FILE:h}"
print -r -- "$BEST_EXE" > "$GAME_PATH_FILE"
print -r -- "Launching CoC2 with CoC2 Translator through CrossOver..."
VNREVIVAL_WINDOWS_RUNTIME=crossover \
  VNREVIVAL_CROSSOVER_APP="$CROSSOVER_APP" \
  VNREVIVAL_CROSSOVER_BOTTLE="$BEST_BOTTLE" \
  exec "$TRANSLATOR_LAUNCHER"
