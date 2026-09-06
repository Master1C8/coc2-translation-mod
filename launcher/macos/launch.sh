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
WINDOWS_EXECUTABLE=$(plist_value VNRevivalWindowsExecutable)
DEFAULT_BOTTLE=$(plist_value VNRevivalCrossOverBottle)
CROSSOVER_GAME_PATH=$(plist_value VNRevivalCrossOverGamePath)
DATA_DIRECTORY=$(plist_value VNRevivalDataDirectory)
LAUNCH_STRATEGY=$(plist_value VNRevivalLaunchStrategy)
DEBUG_TARGET_TITLE=$(plist_value VNRevivalDebugTargetTitle)
DEBUG_TARGET_URL=$(plist_value VNRevivalDebugTargetURL)
VERSION=$(plist_value CFBundleShortVersionString)
BUILD_NUMBER=$(plist_value CFBundleVersion)
WINDOWS_DISTRIBUTION_NAME=$(plist_value VNRevivalWindowsDistributionName)

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
PARALLELS_CTL="${VNREVIVAL_PARALLELS_CTL:-/usr/local/bin/prlctl}"
if [[ ! -x "$PARALLELS_CTL" ]]; then
  PARALLELS_CTL="/Applications/Parallels Desktop.app/Contents/MacOS/prlctl"
fi
PARALLELS_PAYLOAD="$RESOURCE_DIR/parallels/$WINDOWS_DISTRIBUTION_NAME"
PARALLELS_STAGE_ID="$VERSION-$BUILD_NUMBER"
PARALLELS_STAGE_ROOT="$HOME/Documents/VN Revival/Parallels/$GAME_ID/$PARALLELS_STAGE_ID"
PARALLELS_STAGE="$PARALLELS_STAGE_ROOT/$WINDOWS_DISTRIBUTION_NAME"
PARALLELS_WINDOWS_SOURCE="\\\\Mac\\Home\\Documents\\VN Revival\\Parallels\\$GAME_ID\\$PARALLELS_STAGE_ID\\$WINDOWS_DISTRIBUTION_NAME"
PARALLELS_WINDOWS_LAUNCHER="$PARALLELS_WINDOWS_SOURCE\\$PRODUCT_NAME.exe"
PARALLELS_WINDOWS_LOCAL_DIR="%LOCALAPPDATA%\\VN Revival\\Parallels\\$GAME_ID\\$PARALLELS_STAGE_ID\\$WINDOWS_DISTRIBUTION_NAME"
PARALLELS_WINDOWS_LOCAL_LAUNCHER="$PARALLELS_WINDOWS_LOCAL_DIR\\$PRODUCT_NAME.exe"

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
  ps -ax -o command= | /usr/bin/awk -v executable="$GAME_PROCESS_NAME" 'index($0, executable) && $0 !~ /--type=/{found=1} END{exit !found}'
}

choose_game_executable() {
  VNREVIVAL_GAME_TITLE="$GAME_TITLE" /usr/bin/osascript \
    -e 'POSIX path of (choose file with prompt ("Locate the Windows executable for " & (system attribute "VNREVIVAL_GAME_TITLE")))' \
    2>/dev/null
}

if [[ "$LAUNCH_STRATEGY" != "electron-cdp" ]]; then
  show_error "This build uses an unsupported game launch strategy."
  exit 1
fi

select_parallels_vm() {
  if [[ -n "${VNREVIVAL_PARALLELS_VM:-}" ]]; then
    print -r -- "$VNREVIVAL_PARALLELS_VM"
    return
  fi
  local -a vm_names
  vm_names=("${(@f)$("$PARALLELS_CTL" list --all --output name --no-header 2>/dev/null)}")
  vm_names=("${(@)vm_names:#}")
  if (( ${#vm_names} == 1 )); then
    print -r -- "$vm_names[1]"
    return
  fi
  if (( ${#vm_names} == 0 )); then
    return 1
  fi
  local vm_options="${(F)vm_names}"
  VNREVIVAL_TRANSLATOR_TITLE="$PRODUCT_NAME" VNREVIVAL_VM_OPTIONS="$vm_options" /usr/bin/osascript \
    -e 'set vmOptions to paragraphs of (system attribute "VNREVIVAL_VM_OPTIONS")' \
    -e 'set selectedVM to choose from list vmOptions with title (system attribute "VNREVIVAL_TRANSLATOR_TITLE") with prompt "Choose a Windows virtual machine" OK button name "Launch" cancel button name "Cancel"' \
    -e 'if selectedVM is false then return ""' \
    -e 'return item 1 of selectedVM' 2>/dev/null
}

launch_with_parallels() {
  if [[ ! -x "$PARALLELS_CTL" ]]; then
    show_error "Parallels Desktop was not found."
    return 1
  fi
  if [[ ! -f "$PARALLELS_PAYLOAD/$PRODUCT_NAME.exe" || ! -f "$PARALLELS_PAYLOAD/resources/local_service.py" ]]; then
    show_error "The Parallels launcher payload is missing. Reinstall the complete application."
    return 1
  fi
  local parallels_vm
  parallels_vm=$(select_parallels_vm || true)
  if [[ -z "$parallels_vm" ]]; then
    show_error "A Windows virtual machine was not selected."
    return 1
  fi
  if ! "$PARALLELS_CTL" status "$parallels_vm" >/dev/null 2>&1; then
    show_error "The selected Parallels virtual machine is unavailable."
    return 1
  fi
  local parallels_status
  parallels_status=$("$PARALLELS_CTL" list --all --output status --no-header --name "$parallels_vm" 2>/dev/null)
  if [[ "$parallels_status" == "paused" ]]; then
    if ! "$PARALLELS_CTL" resume "$parallels_vm" >/dev/null 2>&1; then
      show_error "The selected Parallels virtual machine could not be resumed."
      return 1
    fi
  elif [[ "$parallels_status" != "running" ]]; then
    if ! "$PARALLELS_CTL" start "$parallels_vm" >/dev/null 2>&1; then
      show_error "The selected Parallels virtual machine could not be started."
      return 1
    fi
  fi

  mkdir -p "$PARALLELS_STAGE_ROOT"
  /usr/bin/ditto "$PARALLELS_PAYLOAD" "$PARALLELS_STAGE" || {
    show_error "The Windows launcher could not be staged for Parallels."
    return 1
  }

  local guest_ready=0
  for _ in {1..60}; do
    if "$PARALLELS_CTL" exec "$parallels_vm" --current-user cmd.exe /d /s /c ver >/dev/null 2>&1; then
      guest_ready=1
      break
    fi
    sleep 1
  done
  if (( ! guest_ready )); then
    show_error "Windows is running, but Parallels Tools are not ready for the current user."
    return 1
  fi
  local verify_command="if exist \"$PARALLELS_WINDOWS_LAUNCHER\" (exit /b 0) else (exit /b 1)"
  if ! "$PARALLELS_CTL" exec "$parallels_vm" --current-user cmd.exe /d /s /c \
      "$verify_command" >/dev/null 2>&1; then
    show_error "Windows cannot access the shared Documents folder. Enable Parallels Shared Folders and try again."
    return 1
  fi
  local copy_command="robocopy \"$PARALLELS_WINDOWS_SOURCE\" \"$PARALLELS_WINDOWS_LOCAL_DIR\" /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NP & if errorlevel 8 (exit /b 1) else (exit /b 0)"
  if ! "$PARALLELS_CTL" exec "$parallels_vm" --current-user cmd.exe /d /s /c \
      "$copy_command" >/dev/null 2>&1; then
    show_error "The Windows launcher could not be copied to the virtual machine's local app data."
    return 1
  fi
  local local_verify_command="if exist \"$PARALLELS_WINDOWS_LOCAL_LAUNCHER\" (exit /b 0) else (exit /b 1)"
  if ! "$PARALLELS_CTL" exec "$parallels_vm" --current-user cmd.exe /d /s /c \
      "$local_verify_command" >/dev/null 2>&1; then
    show_error "The Windows launcher is missing after the Parallels copy step."
    return 1
  fi
  local launch_command="start \"\" \"$PARALLELS_WINDOWS_LOCAL_LAUNCHER\""
  if ! "$PARALLELS_CTL" exec "$parallels_vm" --current-user cmd.exe /d /s /c \
      "$launch_command" >/dev/null 2>&1; then
    show_error "The Windows translator could not be started through Parallels."
    return 1
  fi
}

WINDOWS_RUNTIME="${VNREVIVAL_WINDOWS_RUNTIME:-auto}"
if [[ "$WINDOWS_RUNTIME" == "auto" ]]; then
  if [[ -x "$WINE" ]]; then
    WINDOWS_RUNTIME="crossover"
  elif [[ -x "$PARALLELS_CTL" ]]; then
    WINDOWS_RUNTIME="parallels"
  fi
fi
case "$WINDOWS_RUNTIME" in
  parallels)
    launch_with_parallels
    exit $?
    ;;
  crossover)
    if [[ ! -x "$WINE" ]]; then
      show_error "CrossOver was not found in /Applications."
      exit 1
    fi
    ;;
  *)
    show_error "Install CrossOver or Parallels Desktop to run the Windows version of $GAME_SHORT_TITLE."
    exit 1
    ;;
esac

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
    --data-dir "$SERVICE_DATA_DIR" --credential-id "$GAME_ID" >>"$SERVICE_LOG" 2>&1 &
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

if [[ -f "$STEAM_EXE" ]]; then
  "$WINE" --bottle "$BOTTLE" --no-wait "$STEAM_EXE" -applaunch "$STEAM_APP_ID" \
    "--remote-debugging-address=127.0.0.1" "--remote-debugging-port=$PORT" >/dev/null 2>&1
fi

for _ in {1..20}; do
  game_main_running && break
  sleep 0.5
done

if ! game_main_running; then
  "$WINE" --bottle "$BOTTLE" --no-wait "$GAME_EXE" \
    "--remote-debugging-address=127.0.0.1" "--remote-debugging-port=$PORT" >/dev/null 2>&1
fi

for _ in {1..20}; do
  game_main_running && break
  sleep 0.5
done
if ! game_main_running; then
  show_error "The selected executable did not start the expected game process. Choose the game's main EXE and try again."
  exit 1
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
