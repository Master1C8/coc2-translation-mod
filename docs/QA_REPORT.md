# Отчёт проверки 0.10.0

Дата: 2026-09-06
Область: исходники CoC2 runtime/realtime DOM-переводчика

## Автоматически проверяемые свойства

- пользовательский registry содержит ровно `Google Translate` и `OpenAI-compatible`;
- preset OpenCode Go, OpenCode Zen, OpenRouter, DeepSeek, LM Studio и Custom имеют ожидаемые Base URL;
- удалённый HTTP endpoint отклоняется, а HTTP loopback IPv4, IPv6 и `localhost` разрешены;
- custom URL отклоняет credentials, query, fragment и encoded path traversal;
- credential identity разделяется по Base URL;
- macOS Keychain получает ключ через stdin, а не аргумент процесса;
- status не обращается к key-required endpoint до сохранения ключа;
- `/models` разбирает model ID, а Bearer key находится в header и отсутствует в URL;
- Chat Completions использует системную инструкцию, JSON Schema и ручной model ID;
- ответ получает `reviewed: false`, а повреждённые контекстные маркеры отклоняются;
- API/auth/model/network ошибки возвращаются кодами без утечки секрета;
- local helper слушает только loopback, требует одноразовый токен и ограничивает размер JSON;
- provider cache v4 разделяет preset, Base URL, model ID и версию prompt;
- прежняя v1/v2 → v3 миграция Google-кэша остаётся доступной;
- DOM runtime сохраняет контекстную группировку, пофрагментный fallback, формы/слоты/имена, `Original / Translation`, `Ctrl+Shift+T`, RTL, шрифты и переносы;
- `IntersectionObserver`, `MutationObserver` и `visibilitychange` сохраняют экономный видимый/изменённый проход;
- macOS/Windows launchers сохраняют строгий CDP target, системный выбор EXE, сохранённый путь и lifecycle helper;
- Windows package больше не устанавливает переводческий engine или языковые модели и содержит только embeddable Python standard library helper;
- shared runtime и launchers не содержат идентичность CoC2; она поступает из `game.json` и адаптера;
- repository scan отклоняет возвращение удалённых provider, asset-workbench или словарной логики в runtime/launcher.

## Выполненные команды

```text
./scripts/test-coc2.sh
```

Результат: `PASS`.

- 19 Node.js tests: provider registry, Google/OpenAI-compatible requests,
  cache isolation/migration, UTF-8 splitting, context markers and launcher
  lifecycle contracts;
- 20 Python tests: manifest/launcher contracts и local helper, включая preset,
  URL policy, credential vault, model discovery, Chat Completions, structured
  response fallback, marker validation и safe errors;
- source verification: 249 языков;
- syntax/build checks: JavaScript, Python, shell, Swift typecheck, rendered
  Windows launcher compiled with MinGW and `-Werror`;
- repository invariant scans: `PASS`.

Дополнительные целевые проверки:

```text
node --test tests/providers.test.js tests/translation-core.test.js
python3 -m unittest tests.test_local_service
Google Chrome --headless ... tests/runtime-smoke.html
```

Browser smoke: `PASS`. Проверены видимый и появившийся после прокрутки DOM,
контекстные маркеры без `innerHTML`, переключение Original / Translation,
RTL/шрифты/переносы, восстановление оригинала, миграция Google cache v1 -> v3,
ровно два provider и OpenAI-compatible setup с шестью preset. Внешние API в
smoke-тесте заменены локальными ответами.

## Ручные проверки

В рамках изменения 0.10.0 ручной запуск CoC2, реальные внешние API-запросы, установка приложения, публикация архивов и проверка на физической Windows/Intel Mac не выполнялись. Предыдущие ручные проверки старой provider-архитектуры не выдаются за проверку этой версии.

## Остаётся проверить вручную

- реальный запуск актуальной CoC2 на macOS/CrossOver и Windows 10/11;
- Steam discovery, системный выбор EXE, сохранение пути и повторный запуск;
- OpenCode Go, OpenCode Zen, OpenRouter и DeepSeek с пользовательскими ключами;
- LM Studio и Custom loopback endpoint без ключа;
- Custom HTTPS endpoint с отдельным credential scope;
- сюжет, выборы, tooltip, бой, история и динамически появляющийся текст;
- Cancel при активном запросе и остановка работы при скрытом окне;
- RTL/CJK/Indic/Thai и длинные подписи на реальном DOM CoC2;
- Defender, SmartScreen, Gatekeeper, Developer ID/Authenticode и нотариальное заверение публичного релиза.
