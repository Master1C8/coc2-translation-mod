#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
cd "$ROOT"

node --test tests/translation-core.test.js
node --check src/translation-core.js
node --check src/languages.js
node --check src/translator-runtime.js

if rg -n "381780|BepInEx|StorySentenceElement|EightyDaysRussianTranslator" src launcher -g '!READY_TO_SHARE/**'; then
  echo "Found identity left over from the 80 Days implementation" >&2
  exit 1
fi

if rg -n -i "glossary|словар" src launcher; then
  echo "Removed dictionary functionality is still present" >&2
  exit 1
fi

for REQUIRED in 'autoTranslate' 'showOriginal' 'showTranslations' 'mymemory' 'exportCache' 'importCache' 'clearCacheForLanguage' 'privacyAccepted'; do
  rg -q "$REQUIRED" src/translator-runtime.js || {
    echo "Missing runtime feature: $REQUIRED" >&2
    exit 1
  }
done

COUNT=$(wc -l < src/languages.txt | tr -d ' ')
if [[ "$COUNT" != "249" ]]; then
  echo "Language catalog is unexpectedly short: $COUNT" >&2
  exit 1
fi

echo "Source verification passed ($COUNT languages)"
