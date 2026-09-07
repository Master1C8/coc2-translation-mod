# QA report 0.10.2

Дата последней полной проверки: 2026-09-07.

## Каноническая команда

```text
./scripts/test-coc2.sh --quiet
```

Verbose-вариант той же проверки используется для диагностики. Focused-команды
перечислены в `docs/DEVELOPMENT.md` и не заменяют полный integration gate.

## Проверяемые области

- translation core: Unicode-safe splitting, context markers, language aliases,
  provider cache keys и фильтрация технического текста;
- provider registry: Google и OpenAI-compatible request contracts;
- canonical 30-language catalog, генерируемый из `src/languages.json`;
- CoC2 manifest и DOM adapter contract;
- credential vault, URL policy, model discovery, Chat Completions, structured
  output fallback, optional parameters, marker validation и safe errors;
- JavaScript, Python, zsh и Swift syntax/type checks;
- Windows launcher compilation с MinGW и `-Werror`, когда toolchain доступен;
- repository invariants: отсутствие чужой игровой идентичности, удалённых
  providers и несовместимых Chromium API.

Browser smoke fixture находится в `tests/runtime-smoke.html`, setup и сценарий
— в `tests/runtime/`, а полный test gate запускает её через локальный headless
Chrome/Chromium, когда браузер установлен. Перед публичной сборкой также
проверяются реальные macOS/Windows artifacts через `scripts/verify.sh`.

## Последний результат

- Node.js: 23 tests passed.
- Python: 37 tests passed.
- Source and manifest verification: passed.
- Рабочее дерево после проверки: без изменений исходников со стороны тестов.

Подробные пользовательские свойства не дублируются здесь: они находятся в
`docs/USER_GUIDE.md`, а устойчивые технические инварианты — в
`docs/ARCHITECTURE.md`.
