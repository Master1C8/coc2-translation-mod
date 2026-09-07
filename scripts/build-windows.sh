#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h}"
: "${VNREVIVAL_GAME:?Set VNREVIVAL_GAME or invoke this script through a game-specific build script}"
GAME_ID="$VNREVIVAL_GAME"
GAME_MANIFEST="$ROOT/src/games/$GAME_ID/game.json"
manifest_value() { python3 "$ROOT/scripts/game-manifest.py" "$GAME_MANIFEST" "$1"; }
python3 "$ROOT/scripts/game-manifest.py" "$GAME_MANIFEST" >/dev/null
VERSION=$(tr -d '[:space:]' < "$ROOT/VERSION")
PRODUCT_NAME=$(manifest_value translatorName)
GAME_TITLE=$(manifest_value title)
STEAM_APP_ID=$(manifest_value steamAppId)
WINDOWS_EXECUTABLE=$(manifest_value windowsExecutable)
DATA_DIRECTORY=$(manifest_value dataDirectory)
ICON_PNG=$(manifest_value iconPng)
DATA_DIRECTORY_WINDOWS=$(python3 -c 'import sys; print(sys.argv[1].replace("/", "\\"))' "$DATA_DIRECTORY")
ARCHIVE_PREFIX=$(manifest_value archivePrefix)
LAUNCH_STRATEGY=$(manifest_value launchStrategy)
DEBUG_TARGET_TITLE=$(manifest_value debugTargetTitleContains)
DEBUG_TARGET_URL=$(manifest_value debugTargetUrlContains)
[[ "$LAUNCH_STRATEGY" == "electron-cdp" ]] || { echo "Unsupported launch strategy: $LAUNCH_STRATEGY" >&2; exit 1; }
PYTHON_VERSION="3.11.9"
BUILD_ROOT="$ROOT/.build/windows"
DIST_NAME=$(manifest_value windowsDistributionName)
DIST_DIR="$BUILD_ROOT/$DIST_NAME"
RESOURCE_DIR="$DIST_DIR/resources"
PYTHON_DIR="$RESOURCE_DIR/python"
READY_DIR="$ROOT/launcher/READY_TO_SHARE"
ZIP_PATH="$READY_DIR/$ARCHIVE_PREFIX-Windows-$VERSION.zip"
CHECKSUM_PATH="$ROOT/.build/checksums/${ZIP_PATH:t}.sha256"
PYTHON_ZIP="$ROOT/.build/cache/python-$PYTHON_VERSION-embed-amd64.zip"
PYTHON_URL="https://www.python.org/ftp/python/$PYTHON_VERSION/python-$PYTHON_VERSION-embed-amd64.zip"
CC="${VNREVIVAL_WINDOWS_CC:-$(command -v x86_64-w64-mingw32-gcc)}"
WINDRES="${VNREVIVAL_WINDOWS_WINDRES:-$(command -v x86_64-w64-mingw32-windres)}"
PROJECT_PYTHON="$ROOT/.venv/bin/python"
ICON_PYTHON="${VNREVIVAL_ICON_PYTHON:-$PROJECT_PYTHON}"
BUNDLE="${1:-$ROOT/.build/translator.bundle.js}"
WINDOWS_SIGN_CERT="${VNREVIVAL_WINDOWS_SIGN_CERT:-}"
WINDOWS_SIGN_PASSWORD="${VNREVIVAL_WINDOWS_SIGN_PASSWORD:-}"
WINDOWS_SIGN_TIMESTAMP="${VNREVIVAL_WINDOWS_SIGN_TIMESTAMP:-http://timestamp.digicert.com}"
WINDOWS_SIGN_TOOL="${VNREVIVAL_WINDOWS_SIGN_TOOL:-$(command -v osslsigncode || true)}"
WINDOWS_UNPACKED_ONLY="${VNREVIVAL_WINDOWS_UNPACKED_ONLY:-0}"
[[ "$WINDOWS_UNPACKED_ONLY" == "0" || "$WINDOWS_UNPACKED_ONLY" == "1" ]]

if [[ ! -x "$ICON_PYTHON" ]]; then
  echo "Python image build environment is missing. Run 'uv sync' in $ROOT or set VNREVIVAL_ICON_PYTHON." >&2
  exit 1
fi
[[ -x "$CC" && -x "$WINDRES" && -s "$BUNDLE" && -s "$ROOT/$ICON_PNG" ]]
mkdir -p "$ROOT/.build/cache"
if [[ "$WINDOWS_UNPACKED_ONLY" == "0" ]]; then
  mkdir -p "$ROOT/.build/checksums" "$READY_DIR"
fi
if [[ ! -s "$PYTHON_ZIP" ]]; then
  curl -fL --retry 3 --output "$PYTHON_ZIP" "$PYTHON_URL"
fi

rm -rf "$BUILD_ROOT"
mkdir -p "$PYTHON_DIR"
unzip -q "$PYTHON_ZIP" -d "$PYTHON_DIR"

cp "$BUNDLE" "$RESOURCE_DIR/translator.bundle.js"
cp "$ROOT/src/local_service.py" "$RESOURCE_DIR/local_service.py"
cp "$ROOT/src/openai-compatible.json" "$RESOURCE_DIR/openai-compatible.json"
cp "$GAME_MANIFEST" "$RESOURCE_DIR/game.json"
python3 "$ROOT/scripts/render-template.py" "$ROOT/launcher/windows/README-Windows.txt" "$DIST_DIR/README.txt" \
  PRODUCT_NAME "$PRODUCT_NAME" GAME_TITLE "$GAME_TITLE" DATA_DIRECTORY_WINDOWS "$DATA_DIRECTORY_WINDOWS"
python3 "$ROOT/scripts/render-template.py" "$ROOT/launcher/windows/THIRD_PARTY_NOTICES.txt" "$DIST_DIR/THIRD_PARTY_NOTICES.txt" \
  PRODUCT_NAME "$PRODUCT_NAME"
cp "$ROOT/LICENSE" "$DIST_DIR/LICENSE"

"$ICON_PYTHON" -c 'from PIL import Image; import sys; image=Image.open(sys.argv[1]).convert("RGBA"); image.save(sys.argv[2], format="ICO", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])' \
  "$ROOT/$ICON_PNG" "$BUILD_ROOT/AppIcon.ico"

VERSION_COMMAS=${VERSION//./,}
python3 "$ROOT/scripts/render-template.py" "$ROOT/launcher/windows/launcher.c" "$BUILD_ROOT/launcher.c" \
  VERSION "$VERSION" PRODUCT_NAME "$PRODUCT_NAME" GAME_TITLE "$GAME_TITLE" \
  WINDOWS_EXECUTABLE "$WINDOWS_EXECUTABLE" DATA_DIRECTORY_WINDOWS "$DATA_DIRECTORY_WINDOWS" \
  GAME_ID "$GAME_ID" STEAM_APP_ID "$STEAM_APP_ID" DEBUG_TARGET_TITLE "$DEBUG_TARGET_TITLE" DEBUG_TARGET_URL "$DEBUG_TARGET_URL"
python3 "$ROOT/scripts/render-template.py" "$ROOT/launcher/windows/app.manifest" "$BUILD_ROOT/app.manifest" \
  GAME_ID "$GAME_ID" PRODUCT_NAME "$PRODUCT_NAME"
python3 "$ROOT/scripts/render-template.py" "$ROOT/launcher/windows/app.rc.in" "$BUILD_ROOT/app.rc" \
  ICON_PATH "$BUILD_ROOT/AppIcon.ico" MANIFEST_PATH "$BUILD_ROOT/app.manifest" \
  VERSION_COMMAS "$VERSION_COMMAS" VERSION "$VERSION" PRODUCT_NAME "$PRODUCT_NAME"

"$WINDRES" "$BUILD_ROOT/app.rc" -O coff -o "$BUILD_ROOT/app-res.o"
"$CC" -std=c11 -O2 -s -Wall -Wextra -Werror -municode -mwindows \
  "$BUILD_ROOT/launcher.c" "$BUILD_ROOT/app-res.o" \
  -o "$DIST_DIR/$PRODUCT_NAME.exe" \
  -Wl,--major-subsystem-version,6,--minor-subsystem-version,2 \
  -lwinhttp -lws2_32 -lshell32 -lole32 -ladvapi32 -lcomdlg32

if [[ -n "$WINDOWS_SIGN_CERT" ]]; then
  [[ -x "$WINDOWS_SIGN_TOOL" && -s "$WINDOWS_SIGN_CERT" ]]
  SIGNED_EXE="$BUILD_ROOT/$PRODUCT_NAME-signed.exe"
  "$WINDOWS_SIGN_TOOL" sign \
    -pkcs12 "$WINDOWS_SIGN_CERT" \
    -pass "$WINDOWS_SIGN_PASSWORD" \
    -n "$PRODUCT_NAME by VN Revival" \
    -i "https://vnrevival.fun/" \
    -ts "$WINDOWS_SIGN_TIMESTAMP" \
    -in "$DIST_DIR/$PRODUCT_NAME.exe" \
    -out "$SIGNED_EXE"
  mv "$SIGNED_EXE" "$DIST_DIR/$PRODUCT_NAME.exe"
fi

file "$DIST_DIR/$PRODUCT_NAME.exe" > "$BUILD_ROOT/executable-type.txt"
grep -Eq 'PE32\+ executable.*x86-64' "$BUILD_ROOT/executable-type.txt"
[[ -s "$DIST_DIR/$PRODUCT_NAME.exe" ]]
[[ -s "$DIST_DIR/resources/python/python.exe" ]]
[[ -s "$DIST_DIR/resources/local_service.py" ]]
[[ -s "$DIST_DIR/resources/openai-compatible.json" ]]
[[ -s "$DIST_DIR/resources/translator.bundle.js" ]]
[[ -s "$DIST_DIR/resources/game.json" ]]

if [[ "$WINDOWS_UNPACKED_ONLY" == "1" ]]; then
  echo "Built unpacked Windows payload at $DIST_DIR"
  exit 0
fi

rm -f "$ZIP_PATH" "$CHECKSUM_PATH"
(cd "$BUILD_ROOT" && zip -qry "$ZIP_PATH" "$DIST_NAME")
(cd "$READY_DIR" && shasum -a 256 "${ZIP_PATH:t}") > "$CHECKSUM_PATH"

unzip -Z1 "$ZIP_PATH" > "$BUILD_ROOT/archive-contents.txt"
grep -Fqx "$DIST_NAME/$PRODUCT_NAME.exe" "$BUILD_ROOT/archive-contents.txt"
grep -Fqx "$DIST_NAME/resources/python/python.exe" "$BUILD_ROOT/archive-contents.txt"
grep -Fqx "$DIST_NAME/resources/local_service.py" "$BUILD_ROOT/archive-contents.txt"
grep -Fqx "$DIST_NAME/resources/openai-compatible.json" "$BUILD_ROOT/archive-contents.txt"
grep -Fqx "$DIST_NAME/resources/translator.bundle.js" "$BUILD_ROOT/archive-contents.txt"
grep -Fqx "$DIST_NAME/resources/game.json" "$BUILD_ROOT/archive-contents.txt"

echo "Built $ZIP_PATH"
