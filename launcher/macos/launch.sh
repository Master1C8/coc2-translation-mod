#!/bin/zsh
set -u

SCRIPT_DIR="${0:A:h}"
RESOURCE_DIR="${SCRIPT_DIR:h}/Resources"
INFO_PLIST="${SCRIPT_DIR:h}/Info.plist"
plist_value() { /usr/libexec/PlistBuddy -c "Print :$1" "$INFO_PLIST"; }

PRODUCT_NAME=$(plist_value CFBundleDisplayName)
GAME_ID=$(plist_value VNRevivalGameID)
GAME_TITLE=$(plist_value VNRevivalGameTitle)
GAME_SHORT_TITLE=$(plist_value VNRevivalShortTitle)
STEAM_APP_ID=$(plist_value VNRevivalSteamAppID)
DEFAULT_BOTTLE=$(plist_value VNRevivalCrossOverBottle)
CROSSOVER_GAME_PATH=$(plist_value VNRevivalCrossOverGamePath)
DATA_DIRECTORY=$(plist_value VNRevivalDataDirectory)
LAUNCH_STRATEGY=$(plist_value VNRevivalLaunchStrategy)
DEBUG_TARGET_TITLE=$(plist_value VNRevivalDebugTargetTitle)
DEBUG_TARGET_URL=$(plist_value VNRevivalDebugTargetURL)

CONTROLLER="$RESOURCE_DIR/VNRevivalTranslatorController"
TRANSLATOR="$RESOURCE_DIR/translator.bundle.js"
LOCAL_SERVICE="$RESOURCE_DIR/local_service.py"
CROSSOVER_APP="${VNREVIVAL_CROSSOVER_APP:-/Applications/CrossOver.app}"
BOTTLE="${VNREVIVAL_CROSSOVER_BOTTLE:-$DEFAULT_BOTTLE}"
WINE="$CROSSOVER_APP/Contents/SharedSupport/CrossOver/bin/wine"
BOTTLE_DIR="$HOME/Library/Application Support/CrossOver/Bottles/$BOTTLE"
STEAM_EXE="$BOTTLE_DIR/drive_c/Program Files (x86)/Steam/steam.exe"
GAME_EXE="$BOTTLE_DIR/$CROSSOVER_GAME_PATH"
GAME_PATH_DIR="$HOME/Library/Application Support/VN Revival/Translator Paths"
GAME_PATH_FILE="$GAME_PATH_DIR/$GAME_ID.txt"
SERVICE_DATA_DIR="${VNREVIVAL_SERVICE_DATA_DIR:-$HOME/Library/Application Support/$DATA_DIRECTORY}"
SERVICE_LOG="$SERVICE_DATA_DIR/local-service.log"
RESELECT_MARKER="$SERVICE_DATA_DIR/.reselect-game-executable"
SERVICE_PID=""
STEAM_GAME_START_TIMEOUT_SECONDS=120

cleanup() {
  if [[ -n "$SERVICE_PID" ]] && kill -0 "$SERVICE_PID" >/dev/null 2>&1; then
    kill "$SERVICE_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

show_error() {
  VNREVIVAL_TRANSLATOR_TITLE="$PRODUCT_NAME" VNREVIVAL_TRANSLATOR_ERROR="$1" /usr/bin/osascript \
    -e 'display alert (system attribute "VNREVIVAL_TRANSLATOR_TITLE") message (system attribute "VNREVIVAL_TRANSLATOR_ERROR") as critical' \
    >/dev/null 2>&1 || true
}

game_main_running() {
  ps -ax -o command= | VNREVIVAL_GAME_PROCESS="$GAME_PROCESS_NAME" /usr/bin/awk \
    'BEGIN{executable=ENVIRON["VNREVIVAL_GAME_PROCESS"]} index($0, executable) && $0 !~ /--type=/{found=1} END{exit !found}'
}

choose_game_executable() {
  VNREVIVAL_GAME_TITLE="$GAME_TITLE" /usr/bin/osascript \
    -e 'POSIX path of (choose file with prompt ("Locate the Windows executable for " & (system attribute "VNREVIVAL_GAME_TITLE")))' \
    2>/dev/null
}

is_steam_library_game_path() {
  local normalized_path="${GAME_EXE:l}"
  local bottle_prefix="${BOTTLE_DIR:l}/"
  [[ "$normalized_path" == "$bottle_prefix"* && "$normalized_path" == *"/steamapps/common/"* ]]
}

if [[ "$LAUNCH_STRATEGY" != "electron-cdp" ]]; then
  show_error "This build uses an unsupported game launch strategy."
  exit 1
fi

if [[ ! -x "$WINE" ]]; then
  show_error "Install CrossOver to run the Windows version of $GAME_SHORT_TITLE on macOS."
  exit 1
fi

FORCE_RESELECT=0
if [[ -f "$RESELECT_MARKER" ]]; then
  rm -f "$RESELECT_MARKER"
  FORCE_RESELECT=1
fi
if (( ! FORCE_RESELECT )) && [[ -s "$GAME_PATH_FILE" ]]; then
  SAVED_GAME_EXE=$(head -n 1 "$GAME_PATH_FILE")
  if [[ -f "$SAVED_GAME_EXE" ]]; then GAME_EXE="$SAVED_GAME_EXE"; fi
fi
if (( FORCE_RESELECT )) || [[ ! -f "$GAME_EXE" ]]; then
  GAME_EXE=$(choose_game_executable || true)
  if [[ ! -f "$GAME_EXE" || "${GAME_EXE:l}" != *.exe ]]; then
    show_error "The executable for $GAME_TITLE was not selected."
    exit 1
  fi
  mkdir -p "$GAME_PATH_DIR"
  print -r -- "$GAME_EXE" > "$GAME_PATH_FILE"
fi
GAME_PROCESS_NAME="${GAME_EXE:t}"
if [[ ! -x "$CONTROLLER" || ! -f "$TRANSLATOR" || ! -f "$LOCAL_SERVICE" ]]; then
  show_error "The translator files are incomplete. Reinstall the application."
  exit 1
fi

if game_main_running; then
  show_error "$GAME_TITLE is already running. Close the game and open $PRODUCT_NAME again."
  exit 1
fi

PORT=9317
while /usr/bin/nc -z 127.0.0.1 "$PORT" >/dev/null 2>&1; do
  PORT=$((PORT + 1))
  if (( PORT > 9399 )); then
    show_error "Could not find a free local port."
    exit 1
  fi
done

SERVICE_PORT=$((PORT + 1))
while /usr/bin/nc -z 127.0.0.1 "$SERVICE_PORT" >/dev/null 2>&1; do
  SERVICE_PORT=$((SERVICE_PORT + 1))
  if (( SERVICE_PORT > 9499 )); then
    SERVICE_PORT=""
    break
  fi
done

PYTHON="${VNREVIVAL_SERVICE_PYTHON:-}"
if [[ -z "$PYTHON" ]]; then
  for CANDIDATE in /usr/bin/python3 /opt/homebrew/bin/python3 /usr/local/bin/python3; do
    if [[ -x "$CANDIDATE" ]]; then
      PYTHON="$CANDIDATE"
      break
    fi
  done
fi

SERVICE_URL=""
SERVICE_TOKEN=""
if [[ -n "$SERVICE_PORT" && -x "$PYTHON" ]]; then
  mkdir -p "$SERVICE_DATA_DIR"
  SERVICE_TOKEN=$(/usr/bin/uuidgen | tr -d '-')
  "$PYTHON" -s "$LOCAL_SERVICE" --port "$SERVICE_PORT" --token "$SERVICE_TOKEN" \
    --data-dir "$SERVICE_DATA_DIR" --credential-id "$GAME_ID" --cdp-port "$PORT" \
    --target-title-hint "$DEBUG_TARGET_TITLE" --target-url-hint "$DEBUG_TARGET_URL" \
    >>"$SERVICE_LOG" 2>&1 &
  SERVICE_PID=$!
  for _ in {1..40}; do
    /usr/bin/nc -z 127.0.0.1 "$SERVICE_PORT" >/dev/null 2>&1 && break
    kill -0 "$SERVICE_PID" >/dev/null 2>&1 || break
    sleep 0.1
  done
  if /usr/bin/nc -z 127.0.0.1 "$SERVICE_PORT" >/dev/null 2>&1; then
    SERVICE_URL="http://127.0.0.1:$SERVICE_PORT"
  else
    cleanup
    SERVICE_PID=""
    SERVICE_TOKEN=""
  fi
fi

if [[ -f "$STEAM_EXE" ]] && is_steam_library_game_path; then
  if ! "$WINE" --bottle "$BOTTLE" --no-wait "$STEAM_EXE" -applaunch "$STEAM_APP_ID" \
      "--remote-debugging-address=127.0.0.1" "--remote-debugging-port=$PORT" >/dev/null 2>&1; then
    show_error "Steam could not be started in CrossOver. Make sure the Steam bottle is available and try again."
    exit 1
  fi
  for (( attempt = 0; attempt < STEAM_GAME_START_TIMEOUT_SECONDS * 2; attempt += 1 )); do
    game_main_running && break
    sleep 0.5
  done
  if ! game_main_running; then
    show_error "Steam did not start $GAME_TITLE. Make sure Steam is running and signed in, then try again."
    exit 1
  fi
else
  "$WINE" --bottle "$BOTTLE" --no-wait "$GAME_EXE" \
    "--remote-debugging-address=127.0.0.1" "--remote-debugging-port=$PORT" >/dev/null 2>&1
  for _ in {1..20}; do
    game_main_running && break
    sleep 0.5
  done
  if ! game_main_running; then
    show_error "The selected executable did not start the expected game process. Choose the game's main EXE and try again."
    exit 1
  fi
fi

if [[ -n "$SERVICE_URL" ]]; then
  CONTROLLER_OUTPUT=$(VNREVIVAL_PRODUCT_NAME="$PRODUCT_NAME" VNREVIVAL_TARGET_TITLE_HINT="$DEBUG_TARGET_TITLE" VNREVIVAL_TARGET_URL_HINT="$DEBUG_TARGET_URL" VNREVIVAL_SOURCE_LABEL="$GAME_ID-translator.bundle.js" "$CONTROLLER" "$PORT" "$TRANSLATOR" "$SERVICE_URL" "$SERVICE_TOKEN" 2>&1)
else
  CONTROLLER_OUTPUT=$(VNREVIVAL_PRODUCT_NAME="$PRODUCT_NAME" VNREVIVAL_TARGET_TITLE_HINT="$DEBUG_TARGET_TITLE" VNREVIVAL_TARGET_URL_HINT="$DEBUG_TARGET_URL" VNREVIVAL_SOURCE_LABEL="$GAME_ID-translator.bundle.js" "$CONTROLLER" "$PORT" "$TRANSLATOR" 2>&1)
fi
CONTROLLER_STATUS=$?
if (( CONTROLLER_STATUS != 0 )); then
  show_error "The game started, but the translator could not connect. Close $GAME_SHORT_TITLE and launch it again through $PRODUCT_NAME.\n\n$CONTROLLER_OUTPUT"
  exit 1
fi

# Keep the credential-backed local helper alive for as long as the game is running.
while game_main_running; do
  sleep 2
done
