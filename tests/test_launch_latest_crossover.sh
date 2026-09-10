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

output=$(VNREVIVAL_CROSSOVER_BOTTLES_DIR="$FIXTURE" \
  "$ROOT/scripts/launch-latest-coc2-crossover.sh" --print)

[[ "$output" == *"Bottle: New"* ]]
[[ "$output" == *"Version: 0.10.1"* ]]
[[ "$output" == *"Executable: $newer/CoC II.exe"* ]]

fake_app="$FIXTURE/CrossOver.app"
fake_wine="$fake_app/Contents/SharedSupport/CrossOver/bin/wine"
steam="$FIXTURE/New/drive_c/Program Files (x86)/Steam/steam.exe"
capture="$FIXTURE/wine-arguments.txt"
/bin/mkdir -p "${fake_wine:h}" "${steam:h}"
: > "$steam"
/usr/bin/printf '%s\n' '#!/bin/zsh' '/usr/bin/printf '\''%s\n'\'' "$@" > "$VNREVIVAL_TEST_CAPTURE"' > "$fake_wine"
/bin/chmod +x "$fake_wine"

VNREVIVAL_CROSSOVER_APP="$fake_app" \
  VNREVIVAL_CROSSOVER_BOTTLES_DIR="$FIXTURE" \
  VNREVIVAL_TEST_CAPTURE="$capture" \
  "$ROOT/scripts/launch-latest-coc2-crossover.sh" >/dev/null

expected_arguments=(--bottle New --no-wait "$steam" -applaunch 1292690)
actual_arguments=("${(@f)$(<"$capture")}")
[[ "${(j:|:)actual_arguments}" == "${(j:|:)expected_arguments}" ]]
