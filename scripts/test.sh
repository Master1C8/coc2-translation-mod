#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
cd "$ROOT"
: "${VNREVIVAL_GAME:?Set VNREVIVAL_GAME or use a game-specific test script such as scripts/test-coc2.sh}"
GAME_ID="$VNREVIVAL_GAME"
GAME_DIR="$ROOT/src/games/$GAME_ID"
GAME_MANIFEST="$ROOT/src/games/$GAME_ID/game.json"
manifest_value() { python3 "$ROOT/scripts/game-manifest.py" "$GAME_MANIFEST" "$1"; }
python3 scripts/game-manifest.py "$GAME_MANIFEST" >/dev/null
PRODUCT_NAME=$(manifest_value translatorName)
GAME_TITLE=$(manifest_value title)
STEAM_APP_ID=$(manifest_value steamAppId)
WINDOWS_EXECUTABLE=$(manifest_value windowsExecutable)
DATA_DIRECTORY=$(manifest_value dataDirectory)
ICON_PNG=$(manifest_value iconPng)
ICON_ICNS=$(manifest_value iconIcns)
DATA_DIRECTORY_WINDOWS=$(python3 -c 'import sys; print(sys.argv[1].replace("/", "\\"))' "$DATA_DIRECTORY")
DEBUG_TARGET_TITLE=$(manifest_value debugTargetTitleContains)
DEBUG_TARGET_URL=$(manifest_value debugTargetUrlContains)

NODE_TESTS=(tests/translation-core.test.js tests/providers.test.js tests/game-adapter.test.js)
GAME_TESTS=("$GAME_DIR"/tests/*.test.js(N))
(( ${#GAME_TESTS} > 0 )) || { echo "No game-specific tests found for $GAME_ID" >&2; exit 1; }
NODE_TESTS+=("${GAME_TESTS[@]}")
VNREVIVAL_GAME="$GAME_ID" node --test "${NODE_TESTS[@]}"
node --check src/translation-core.js
node --check src/languages.js
node --check src/providers.js
node --check "src/games/$GAME_ID/adapter.js"
node --check src/translator-runtime.js
[[ -s "$ROOT/$ICON_PNG" && -s "$ROOT/$ICON_ICNS" ]]
mkdir -p "$ROOT/.build"
python3 scripts/generate-game-config.py "$GAME_MANIFEST" "$ROOT/.build/game-config.js"
node --check "$ROOT/.build/game-config.js"
python3 scripts/render-template.py launcher/windows/launcher.c "$ROOT/.build/windows-launcher-smoke.c" \
  VERSION "$(tr -d '[:space:]' < VERSION)" PRODUCT_NAME "$PRODUCT_NAME" GAME_TITLE "$GAME_TITLE" \
  WINDOWS_EXECUTABLE "$WINDOWS_EXECUTABLE" DATA_DIRECTORY_WINDOWS "$DATA_DIRECTORY_WINDOWS" \
  GAME_ID "$GAME_ID" STEAM_APP_ID "$STEAM_APP_ID" DEBUG_TARGET_TITLE "$DEBUG_TARGET_TITLE" DEBUG_TARGET_URL "$DEBUG_TARGET_URL"
PYTHONPYCACHEPREFIX="$ROOT/.build/python-cache" python3 -m unittest discover -s tests -p 'test_*.py'
zsh -n launcher/macos/launch.sh scripts/build.sh scripts/build-windows.sh scripts/test.sh scripts/verify.sh scripts/build-coc2.sh scripts/test-coc2.sh

if command -v x86_64-w64-mingw32-gcc >/dev/null 2>&1; then
  x86_64-w64-mingw32-gcc -std=c11 -O2 -Wall -Wextra -Werror -municode -mwindows \
    "$ROOT/.build/windows-launcher-smoke.c" -o "$ROOT/.build/windows-launcher-smoke.exe" \
    -lwinhttp -lws2_32 -lshell32 -lole32 -ladvapi32 -lcomdlg32
fi

if grep -RInE "381780|BepInEx|StorySentenceElement|EightyDaysRussianTranslator" src launcher/macos launcher/windows; then
  echo "Found identity left over from the 80 Days implementation" >&2
  exit 1
fi

if grep -RIniE "glossary|словар" src launcher/macos launcher/windows; then
  echo "Removed dictionary functionality is still present" >&2
  exit 1
fi

if grep -RIniE "omori|asset-cache|asset extraction|workbench|bulk translate" \
  src launcher/macos launcher/windows; then
  echo "Found non-realtime translation architecture in the CoC2 runtime" >&2
  exit 1
fi

if grep -RIniE "coc2|corruption of champions" \
  src/translation-core.js src/languages.js src/providers.js src/translator-runtime.js \
  src/local_service.py src/controller launcher/macos launcher/windows/launcher.c; then
  echo "Found a CoC2-specific identity in the shared runtime" >&2
  exit 1
fi

if grep -RInE '[А-Яа-яЁё]' \
  src/translator-runtime.js src/local_service.py \
  src/providers.js launcher/macos/launch.sh launcher/windows/launcher.c launcher/windows/README-Windows.txt "src/games/$GAME_ID/adapter.js"; then
  echo "The mod interface must remain English-only" >&2
  exit 1
fi

for REQUIRED in 'autoTranslate' 'showOriginal' 'showTranslations' 'exportCache' 'importCache' 'clearCacheForLanguage' 'privacyAccepted' 'collapsed' 'collapseToggle' 'updateCollapsedState' 'applyLanguageFormatting' 'restoreLanguageFormatting' 'applyJobTranslation' 'populateLanguageOptions' 'MEMORY_CACHE_LIMIT' 'CACHE_META_KEY' 'CACHE_DIRTY_KEY' 'IntersectionObserver' 'visibilitychange' 'createCacheExportStream' 'importJsonLinesCache' 'providerRegistry'; do
  grep -Fq "$REQUIRED" src/translator-runtime.js || {
    echo "Missing runtime feature: $REQUIRED" >&2
    exit 1
  }
done

grep -Fq 'const MEMORY_CACHE_LIMIT = 20000;' src/translator-runtime.js || {
  echo "RAM cache must retain 20000 recent translations" >&2
  exit 1
}

for REQUIRED in 'google' 'openai-compatible' 'translateChunk' 'supportsLanguage' 'splitText'; do
  grep -Fq "$REQUIRED" src/providers.js || {
    echo "Missing provider feature: $REQUIRED" >&2
    exit 1
  }
done

PROVIDER_COUNT=$(node -e 'require("./src/translation-core.js"); require("./src/providers.js"); process.stdout.write(String(globalThis.VNRevivalTranslationProviders.list.length))')
[[ "$PROVIDER_COUNT" == "2" ]] || {
  echo "The user-facing provider list must contain exactly two entries" >&2
  exit 1
}

for REQUIRED in "#define APP_ID $STEAM_APP_ID" 'WinHttpWebSocket' "$WINDOWS_EXECUTABLE" 'local_service.py' 'python.exe' '__vnRevivalLocalBridge' '--credential-id' 'GetOpenFileNameW' 'load_saved_game_path' 'consume_reselect_marker' 'debug_target_running'; do
  grep -Fq -- "$REQUIRED" "$ROOT/.build/windows-launcher-smoke.c" || {
    echo "Missing Windows launcher feature: $REQUIRED" >&2
    exit 1
  }
done

for REQUIRED in 'OpenAICompatibleCredentialStore' 'openai_status' 'set_openai_key' 'remove_openai_key' 'openai_translate' '/v1/openai-compatible/status' '/v1/openai-compatible/key' '/v1/openai-compatible/translate' 'request_game_executable_change' '/v1/launcher/reselect-executable'; do
  grep -Fq "$REQUIRED" src/local_service.py || {
    echo "Missing local service feature: $REQUIRED" >&2
    exit 1
  }
done

if rg -i 'argos|gemini|mymemory' \
  src scripts launcher docs README.md tests --glob '!src/languages.js' --glob '!src/languages.txt' --glob '!scripts/test.sh'; then
  echo "A removed translation provider is still referenced" >&2
  exit 1
fi

grep -Eq 'SITE_NAME = "VN Revival"' src/translator-runtime.js
grep -Eq 'SITE_URL = "https://vnrevival.fun/"' src/translator-runtime.js
grep -Fq 'https://discord.gg/QgyeWW3Jg' src/translator-runtime.js
grep -Fq 'https://t.me/VnRevival' src/translator-runtime.js
grep -Fq 'mailto:master1c8@proton.me' src/translator-runtime.js
grep -Eq 'VNRevivalGameAdapter' "src/games/$GAME_ID/adapter.js"
grep -Eq 'VNRevivalTranslationCore' src/translation-core.js
grep -Eq 'VNRevivalTranslationProviders' src/providers.js
grep -Eq 'VNRevivalGameConfig' "$ROOT/.build/game-config.js"
grep -Eq 'choose_game_executable' launcher/macos/launch.sh
grep -Eq 'RESELECT_MARKER' launcher/macos/launch.sh
grep -Fq -- '--credential-id "$GAME_ID"' launcher/macos/launch.sh
grep -Eq 'persistControlSettings' src/translator-runtime.js
if grep -Eq 'class="(cacheActions|launcherActions|settingsActions|clearLanguage|export|import|changeExecutable|save|reset)"' src/translator-runtime.js; then
  echo "Removed settings actions are still present in the panel" >&2
  exit 1
fi
grep -Fq 'makeCacheKey(source, language, provider, game.id, providerCacheVariant(provider))' src/translator-runtime.js

COUNT=$(wc -l < src/languages.txt | tr -d ' ')
if [[ "$COUNT" != "249" ]]; then
  echo "Language catalog is unexpectedly short: $COUNT" >&2
  exit 1
fi

echo "Source verification passed ($COUNT languages)"
