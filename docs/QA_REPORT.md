# QA report 0.10.2

Дата последнего полного аудита: 2026-09-12.

## Итог

В проверенной области критических или высоких дефектов не обнаружено.
Исходный код, тесты, сборочные скрипты и документация согласованы с текущей
логикой версии 0.10.2. Автоматизированная проверка не заменяет оставшиеся ручные
платформенные и provider-проверки, перечисленные ниже.

## Область аудита

- DOM runtime: Text-узлы, контекстные маркеры, приватные области, batching, кэш,
  Unicode, RTL и lifecycle автоперевода;
- панель: удалённый first-use вопрос, отсутствие сбора запросов, невыделяемые
  обычные надписи, изоляция событий и сохранение игрового экрана без API-ключа;
- provider/helper: Google, `/models`, Chat Completions, Responses, Messages, optional parameters,
  fallback формата, маркеры, retry/rate limit и безопасные ошибки;
- безопасность: loopback helper/CDP, launch token, URL policy, ограничения размера,
  Keychain/Credential Manager и отсутствие секретов в URL, DOM, кэше и логах;
- лаунчеры: Windows x86-64/Windows 11 on Arm, universal macOS app, CrossOver-only запуск,
  Steam lifecycle и упаковка;
- границы проекта, manifest/adapter contract, карта разработки и пользовательская
  документация.

## Исправления по итогам

- Chat-Completions-only описание заменено на фактические три маршрута OpenCode Go;
- из Development map удалены ссылки на уже удалённые runtime-символы;
- зафиксировано, что сбора запросов нет в панели и runtime; helper-only API
  изолирован launch token и loopback;
- контракт заголовка API-ключа уточнён для Anthropic-compatible Messages;
- `deepseek-v4.1-flash` добавлен в явную таблицу Chat Completions OpenCode Go;
- руководство пользователя зафиксировало невыделяемые надписи, безопасное
  поведение без ключа и все три provider API.

Официальная таблица на дату аудита подтверждает динамический `/models` и три API:
[OpenCode Go](https://dev.opencode.ai/docs/go/). Карточка Luna подтверждает Responses API и набор reasoning
efforts: [OpenAI GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna).

## Каноническая команда

```text
./scripts/test-coc2.sh --quiet
```

Verbose-вариант используется для диагностики. Focused-команды из `docs/DEVELOPMENT.md` не заменяют
полный integration gate.

## Последний автоматизированный результат

- Node.js: 35/35 tests passed.
- Python: 65/65 tests passed.
- Browser smoke: passed.
- JavaScript, Python, zsh и Swift syntax/type checks: passed.
- Windows launcher: MinGW compilation with `-Werror` passed.
- Source/manifest invariants: passed; 30 языков.
- macOS/Windows ZIP: `scripts/verify.sh` passed.
- Тесты не изменили отслеживаемые исходники.

Browser smoke fixture находится в `tests/runtime-smoke.html`, setup и сценарии — в `tests/runtime/`.

## Оставшиеся ручные проверки

Автоматизация не подтверждает без реальных сред:

- Windows 10/11 x64 и Windows 11 on Arm: Steam discovery, системный выбор EXE, повторный запуск и lifecycle;
- Intel Mac и CrossOver: universal binary, поиск бутылки, Steam-запуск и lifecycle;
- сюжет, выборы, tooltip, бой и история в актуальной CoC2;
- визуальные RTL/CJK/Indic/Thai и длинные подписи;
- действительные ключи и модели удалённых preset, включая три протокола, и LM Studio;
- Defender, SmartScreen, Gatekeeper и подписанные/нотаризованные публичные сборки.

Подробные пользовательские свойства не дублируются здесь: они находятся в
`docs/USER_GUIDE.md`, а устойчивые технические инварианты — в `docs/ARCHITECTURE.md`.
