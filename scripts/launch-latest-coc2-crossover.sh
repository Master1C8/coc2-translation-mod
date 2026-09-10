#!/bin/zsh
set -eu

CROSSOVER_APP="${VNREVIVAL_CROSSOVER_APP:-/Applications/CrossOver.app}"
BOTTLES_ROOT="${VNREVIVAL_CROSSOVER_BOTTLES_DIR:-$HOME/Library/Application Support/CrossOver/Bottles}"
WINE="$CROSSOVER_APP/Contents/SharedSupport/CrossOver/bin/wine"
GAME_EXECUTABLE="CoC II.exe"
STEAM_APP_ID=1292690

usage() {
  print -r -- "Usage: ${0:t} [--print]"
  print -r -- ""
  print -r -- "Find the newest installed CoC2 version in all CrossOver bottles."
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

if (( PRINT_ONLY )); then
  exit 0
fi

if [[ ! -x "$WINE" ]]; then
  print -u2 -r -- "CrossOver was not found: $CROSSOVER_APP"
  exit 1
fi

STEAM_EXE="$BOTTLES_ROOT/$BEST_BOTTLE/drive_c/Program Files (x86)/Steam/steam.exe"
if [[ -f "$STEAM_EXE" ]]; then
  print -r -- "Launching through Steam in CrossOver..."
  exec "$WINE" --bottle "$BEST_BOTTLE" --no-wait "$STEAM_EXE" -applaunch "$STEAM_APP_ID"
fi

print -r -- "Steam was not found in the selected bottle; launching the executable directly..."
exec "$WINE" --bottle "$BEST_BOTTLE" --no-wait "$BEST_EXE"
