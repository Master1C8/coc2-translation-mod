#!/bin/zsh
set -eu

ROOT="${0:A:h:h}"
FIXTURE=$(/usr/bin/mktemp -d)
trap '/bin/rm -rf "$FIXTURE"' EXIT INT TERM

older="$FIXTURE/Old/drive_c/Games/CoC2"
newer="$FIXTURE/New/drive_c/Games/CoC2"
/bin/mkdir -p "$older/resources/app" "$newer/resources/app"
: > "$older/CoC II.exe"
: > "$newer/CoC II.exe"
/usr/bin/printf '%s\n' '{"version":"0.9.6"}' > "$older/resources/app/package.json"
/usr/bin/printf '%s\n' '{"version":"0.10.1"}' > "$newer/resources/app/package.json"

fake_crossover="$FIXTURE/CrossOver.app"
fake_wine="$fake_crossover/Contents/SharedSupport/CrossOver/bin/wine"
fake_translator="$FIXTURE/CoC2 Translator.app"
fake_launcher="$fake_translator/Contents/MacOS/CoC2 Translator"
capture="$FIXTURE/translator-environment.txt"
/bin/mkdir -p "${fake_wine:h}" "${fake_launcher:h}" "$FIXTURE/home"
: > "$fake_wine"
/bin/chmod +x "$fake_wine"
/usr/bin/printf '%s\n' '#!/bin/zsh' '/usr/bin/printf '\''%s\n'\'' "$VNREVIVAL_WINDOWS_RUNTIME" "$VNREVIVAL_CROSSOVER_APP" "$VNREVIVAL_CROSSOVER_BOTTLE" > "$VNREVIVAL_TEST_CAPTURE"' > "$fake_launcher"
/bin/chmod +x "$fake_launcher"

output=$(VNREVIVAL_CROSSOVER_BOTTLES_DIR="$FIXTURE" \
  VNREVIVAL_TRANSLATOR_APP="$fake_translator" \
  "$ROOT/scripts/launch-latest-coc2-crossover.sh" --print)

[[ "$output" == *"Bottle: New"* ]]
[[ "$output" == *"Version: 0.10.1"* ]]
[[ "$output" == *"Executable: $newer/CoC II.exe"* ]]
[[ "$output" == *"Translator: $fake_translator"* ]]

HOME="$FIXTURE/home" \
  VNREVIVAL_CROSSOVER_APP="$fake_crossover" \
  VNREVIVAL_CROSSOVER_BOTTLES_DIR="$FIXTURE" \
  VNREVIVAL_TRANSLATOR_APP="$fake_translator" \
  VNREVIVAL_TEST_CAPTURE="$capture" \
  "$ROOT/scripts/launch-latest-coc2-crossover.sh" >/dev/null

expected_environment=(crossover "$fake_crossover" New)
actual_environment=("${(@f)$(<"$capture")}")
[[ "${(j:|:)actual_environment}" == "${(j:|:)expected_environment}" ]]
saved_path="$FIXTURE/home/Library/Application Support/VN Revival/Translator Paths/coc2.txt"
[[ "$(<"$saved_path")" == "$newer/CoC II.exe" ]]
