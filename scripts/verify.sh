#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
VERSION=$(tr -d '[:space:]' < "$ROOT/VERSION")
READY="$ROOT/launcher/READY_TO_SHARE"
APP="$READY/CoC2 Translator.app"
ZIP="$READY/CoC2-Translator-macOS-$VERSION.zip"

[[ -x "$APP/Contents/MacOS/CoC2 Translator" ]]
[[ -x "$APP/Contents/Resources/CoC2TranslatorController" ]]
[[ -s "$APP/Contents/Resources/translator.bundle.js" ]]
[[ -s "$APP/Contents/Resources/AppIcon.icns" ]]
[[ -s "$ZIP" ]]
/usr/bin/codesign --verify --deep --strict "$APP"
(cd "$READY" && shasum -a 256 -c "${ZIP:t}.sha256")

CONTENTS=$(unzip -Z1 "$ZIP")
if print -r -- "$CONTENTS" | rg -i '\.(exe|dll|pak|sav)$|/resources/app/|/steamapps/'; then
  echo "Archive contains game or user files" >&2
  exit 1
fi

USAGE_OUTPUT=$("$APP/Contents/Resources/CoC2TranslatorController" 2>&1 || true)
print -r -- "$USAGE_OUTPUT" | rg -q "Usage:"
echo "Product verification passed"
