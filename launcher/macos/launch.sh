#!/bin/zsh
set -u

SCRIPT_DIR="${0:A:h}"
RESOURCE_DIR="${SCRIPT_DIR:h}/Resources"
CONTROLLER="$RESOURCE_DIR/CoC2TranslatorController"
TRANSLATOR="$RESOURCE_DIR/translator.bundle.js"
CROSSOVER_APP="${COC2_CROSSOVER_APP:-/Applications/CrossOver.app}"
BOTTLE="${COC2_CROSSOVER_BOTTLE:-Steam}"
WINE="$CROSSOVER_APP/Contents/SharedSupport/CrossOver/bin/wine"
BOTTLE_DIR="$HOME/Library/Application Support/CrossOver/Bottles/$BOTTLE"
STEAM_EXE="$BOTTLE_DIR/drive_c/Program Files (x86)/Steam/steam.exe"
GAME_EXE="$BOTTLE_DIR/drive_c/Program Files (x86)/Steam/steamapps/common/Corruption of Champions II/CoC II.exe"

show_error() {
  COC2_TRANSLATOR_ERROR="$1" /usr/bin/osascript \
    -e 'display alert "CoC2 Translator" message (system attribute "COC2_TRANSLATOR_ERROR") as critical' \
    >/dev/null 2>&1 || true
}

if [[ ! -x "$WINE" ]]; then
  show_error "CrossOver не найден в /Applications."
  exit 1
fi
if [[ ! -f "$STEAM_EXE" || ! -f "$GAME_EXE" ]]; then
  show_error "Steam-версия Corruption of Champions II не найдена в бутылке CrossOver '$BOTTLE'."
  exit 1
fi
if [[ ! -x "$CONTROLLER" || ! -f "$TRANSLATOR" ]]; then
  show_error "Файлы переводчика повреждены. Переустановите приложение."
  exit 1
fi

PORT=9317
while /usr/bin/nc -z 127.0.0.1 "$PORT" >/dev/null 2>&1; do
  PORT=$((PORT + 1))
  if (( PORT > 9399 )); then
    show_error "Не удалось найти свободный локальный порт."
    exit 1
  fi
done

"$WINE" --bottle "$BOTTLE" --no-wait "$STEAM_EXE" -applaunch 1292690 \
  "--remote-debugging-address=127.0.0.1" "--remote-debugging-port=$PORT" >/dev/null 2>&1

CONTROLLER_OUTPUT=$("$CONTROLLER" "$PORT" "$TRANSLATOR" 2>&1)
CONTROLLER_STATUS=$?
if (( CONTROLLER_STATUS != 0 )); then
  show_error "Игра запустилась, но переводчик не смог к ней подключиться. Закройте CoC2 и запустите её снова через CoC2 Translator.\n\n$CONTROLLER_OUTPUT"
  exit 1
fi
