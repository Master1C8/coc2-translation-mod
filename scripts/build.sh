#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
VERSION=$(tr -d '[:space:]' < "$ROOT/VERSION")
BUILD_NUMBER=$(date -u +%Y%m%d%H%M)
BUILD_DIR="$ROOT/.build"
READY_DIR="$ROOT/launcher/READY_TO_SHARE"
APP="$READY_DIR/CoC2 Translator.app"
SWIFTC="/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/swiftc"
SDK="/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk"

"$ROOT/scripts/test.sh"
mkdir -p "$BUILD_DIR" "$APP/Contents/MacOS" "$APP/Contents/Resources"

sed "s/__VERSION__/$VERSION/g" "$ROOT/src/translator-runtime.js" > "$BUILD_DIR/translator-runtime.js"
{
  printf '%s\n' '/* CoC2 Translator — generated bundle */'
  cat "$ROOT/src/translation-core.js"
  cat "$ROOT/src/languages.js"
  cat "$BUILD_DIR/translator-runtime.js"
} > "$BUILD_DIR/translator.bundle.js"

[[ -x "$SWIFTC" && -d "$SDK" ]]
mkdir -p "$BUILD_DIR/module-cache"
CLANG_MODULE_CACHE_PATH="$BUILD_DIR/module-cache" "$SWIFTC" \
  -parse-as-library -O -target arm64-apple-macos12.0 -sdk "$SDK" \
  -module-cache-path "$BUILD_DIR/module-cache" \
  "$ROOT/src/controller/main.swift" -o "$BUILD_DIR/CoC2TranslatorController"

sed -e "s/__VERSION__/$VERSION/g" -e "s/__BUILD__/$BUILD_NUMBER/g" \
  "$ROOT/launcher/macos/Info.plist" > "$APP/Contents/Info.plist"
cp "$ROOT/launcher/macos/launch.sh" "$APP/Contents/MacOS/CoC2 Translator"
cp "$BUILD_DIR/CoC2TranslatorController" "$APP/Contents/Resources/"
cp "$BUILD_DIR/translator.bundle.js" "$APP/Contents/Resources/"
cp "$ROOT/assets/AppIcon.icns" "$APP/Contents/Resources/"
cp "$ROOT/README.md" "$APP/Contents/Resources/README.md"
cp "$ROOT/LICENSE" "$APP/Contents/Resources/LICENSE"
chmod +x "$APP/Contents/MacOS/CoC2 Translator" "$APP/Contents/Resources/CoC2TranslatorController"

/usr/bin/codesign --force --deep --sign - "$APP" >/dev/null
rm -f "$READY_DIR/CoC2-Translator-macOS-$VERSION.zip" "$READY_DIR/CoC2-Translator-macOS-$VERSION.zip.sha256"
/usr/bin/ditto -c -k --sequesterRsrc --keepParent "$APP" "$READY_DIR/CoC2-Translator-macOS-$VERSION.zip"
(cd "$READY_DIR" && shasum -a 256 "CoC2-Translator-macOS-$VERSION.zip" > "CoC2-Translator-macOS-$VERSION.zip.sha256")

"$ROOT/scripts/verify.sh"
echo "Built $APP"
