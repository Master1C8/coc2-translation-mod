# Отчёт проверки 0.10.2

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
- OpenCode Go и Zen исключают из picker модели, документированные для несовместимых с Chat Completions API;
- единый model picker показывает бесплатные модели первыми, сортирует группы по алфавиту и не использует аварийный Chromium `datalist`;
- временные OpenAI-compatible ошибки повторяются с backoff/`Retry-After`, а финальная безопасная причина отображается пользователю;
- Chat Completions использует системную инструкцию, JSON Schema и ручной model ID;
- ответ получает `reviewed: false`, а повреждённые контекстные маркеры отклоняются;
- API/auth/model/network ошибки возвращаются кодами без утечки секрета;
- provider HTTP 400/401 с причиной `model unavailable/not supported` классифицируется как ошибка модели, не как локальный 502 или отказ ключа;
- local helper слушает только loopback, требует одноразовый токен и ограничивает размер JSON;
- provider cache v4 разделяет preset, Base URL, model ID, параметры модели и версию prompt;
- каталог языков точно совпадает с 30 локалями VN Revival, а чистый первый запуск выбирает английский и `Auto translate: On`;
- выбор языка постоянно находится в верхней части панели, вне скрываемых настроек;
- общий размер кэша и подтверждаемая кнопка его полного удаления находятся в одной строке;
- длинные информационные подписи Google Translate и OpenAI-compatible отсутствуют и не оставляют пустого отступа;
- автоперевод оформлен как доступный компактный toggle с явными состояниями On/Off;
- при включённом автопереводе кнопка `Translate` заменяется короткой подсказкой, а при выключении появляется снова;
- `Ctrl+Shift+T` отображается внутри основной кнопки и сохраняется при `Translate / Cancel`;
- кнопка `...` отсутствует, а настройки видны в полностью развёрнутой панели и скрыты только вместе со всей панелью;
- заголовок панели не дублирует название и версию проекта; в нём остаётся только кнопка сворачивания;
- штатный успешный перевод не показывает `Done: N` и не оставляет пустой строки статуса;
- в настройке OpenAI-compatible поле API-ключа расположено перед выбором модели;
- модели выбираются в единственном обычном `select` без Chromium `datalist`;
  пункт `Enter model ID manually…` поддерживает отсутствующие в каталоге ID;
- введённый API-ключ автоматически сохраняется при `Enter` или уходе из поля и заменяет прежний ключ endpoint;
- отдельные кнопки сохранения/замены/удаления ключа и обновления моделей отсутствуют;
  список моделей обновляется при открытии picker;
- строка состояния подключения и поясняющие подписи OpenAI-compatible отсутствуют;
- OpenAI-compatible передаёт только явно выбранный reasoning effort, автоматически запрашивает verbosity `low`,
  а явно неподдерживаемые optional-параметры удаляет ограниченным повтором запроса;
- system prompt и словарь находятся внутри общей группы `Advanced`, которая по умолчанию свёрнута;
- раскрытая группа `Advanced` напоминает удалить кэш после правок для повторного перевода уже обработанного текста;
- их редакторы открываются отдельными кнопками; пары словаря сохраняются локально, дописываются к system prompt и изолируют новый кэш от результатов со старым словарём;
- сложные настройки имеют краткие hover-подсказки без дополнительного постоянного текста в панели;
- галочка `UI` находится справа от языка, сохраняется отдельно и применяет встроенный русский интерфейсный preset без сетевых запросов или переводного кэша;
- OpenAI-compatible обрабатывает выбранное пользователем число от одного до восьми независимых переводческих заданий параллельно (по умолчанию четыре),
  не меняя prompt, модель, cache variant или проверку результата;
- прежняя v1/v2 → v3 миграция Google-кэша остаётся доступной;
- DOM runtime сохраняет контекстную группировку, пофрагментный fallback, формы/слоты/имена, `Ctrl+Shift+T`, RTL, шрифты и переносы;
- `IntersectionObserver`, `MutationObserver` и `visibilitychange` сохраняют экономный видимый/изменённый проход, а скрытые tooltip-блоки переводятся заранее без обработки остального скрытого интерфейса;
- macOS/Windows launchers сохраняют строгий CDP target, системный выбор EXE, сохранённый путь и lifecycle helper;
- macOS launcher автоматически выбирает Parallels при отсутствии CrossOver, использует `prlctl exec --current-user` и не открывает гостевой CDP наружу;
- app-only сборка включает проверенный Windows payload для Parallels и не создаёт релизные архивы;
- Windows package больше не устанавливает переводческий engine или языковые модели и содержит только embeddable Python standard library helper;
- shared runtime и launchers не содержат идентичность CoC2; она поступает из `game.json` и адаптера;
- repository scan отклоняет возвращение удалённых provider, asset-workbench или словарной логики в runtime/launcher.

## Выполненные команды

```text
./scripts/test-coc2.sh
```

Результат: `PASS`.

- 22 Node.js tests: точный каталог языков, provider registry, Google/OpenAI-compatible requests,
  cache isolation/migration, UTF-8 splitting, context markers and launcher
  lifecycle contracts;
- 35 Python tests: manifest/launcher contracts и local helper, включая preset,
  URL policy, credential vault, model discovery, Chat Completions, structured
  response/model-parameter fallback, marker validation и safe errors;
- source verification: 30 языков из общего каталога сайта;
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
контекстные маркеры без `innerHTML`, отсутствие кнопки Original,
RTL/шрифты/переносы, восстановление оригинала, миграция Google cache v1 -> v3,
точный 30-язычный селектор с английским при первом запуске, ровно два provider
и OpenAI-compatible setup с шестью preset. Внешние API в
smoke-тесте заменены локальными ответами.

App-only сборка и живой runtime в Parallels также проверены:

```text
VNREVIVAL_APP_ONLY=1 ./scripts/build-coc2.sh
VNREVIVAL_WINDOWS_RUNTIME=parallels VNREVIVAL_PARALLELS_VM="Windows 11" \
  "CoC2 Translator.app/Contents/MacOS/CoC2 Translator"
```

Результат: app-only payload собран и скопирован через Shared Folders в
guest-local `%LOCALAPPDATA%`; `CoC II.exe` открыл CDP на `127.0.0.1:9317`, а
helper — на `127.0.0.1:9400`. Проверка раннего launcher выявила две причины
отсутствия панели: неподдерживаемый старым Chromium `Object.hasOwn` и зависание
WinHTTP при ожидании ответа на большой `Runtime.evaluate`. Runtime 0.10.2 не
использует `Object.hasOwn`; launcher отправляет bundle через отдельное WebSocket-
соединение и подтверждает `window.__vnRevivalTranslator` коротким запросом через
новое соединение. Совместимый bundle внедрён в живую игру: объект панели имеет
версию `0.10.2`. Точный 30-язычный селектор и английский первый выбор подтверждены
browser smoke; открытая до изменения каталога runtime-панель сохраняет прежний
экземпляр до перезапуска страницы. Чистый повторный запуск актуального launcher
требует обычного закрытия уже открытой игры. Релизные архивы при проверке не
создавались.

## Ручные проверки

Реальный runtime на Windows 11 в Parallels проверен. Публичный
`GET https://opencode.ai/zen/v1/models` вернул смешанный каталог; фильтр оставил
20 документированных Chat Completions-моделей. Такой же фильтр применяется к
смешанному каталогу OpenCode Go. Минимальный запрос без ключа к
опубликованной, но фактически недоступной free-модели воспроизвёл upstream HTTP
400 и был безопасно классифицирован как `openai_model_unavailable` с локальным
HTTP 409. Отдельный helper в guest Windows обратился к системному credential
store без чтения или вывода ключа: текущий сохранённый ключ был отклонён Zen с
HTTP 401 для выбранной `glm-5.3-flash` и контрольной `deepseek-v4-flash`.
Успешный платный перевод требует перевыпущенного ключа. Публикация архивов и
проверка на физической Windows, CrossOver или Intel Mac не выполнялись.

## Остаётся проверить вручную

- реальный запуск актуальной CoC2 на macOS/CrossOver и физической Windows 10/11;
- автоматический Steam discovery и системный выбор EXE при отсутствии сохранённого пути;
- успешный OpenCode Zen перевод после перевыпуска отклонённого ключа;
- OpenCode Go, OpenRouter и DeepSeek с пользовательскими ключами;
- LM Studio и Custom loopback endpoint без ключа;
- Custom HTTPS endpoint с отдельным credential scope;
- сюжет, выборы, tooltip, бой, история и динамически появляющийся текст;
- Cancel при активном запросе и остановка работы при скрытом окне;
- RTL/CJK/Indic/Thai и длинные подписи на реальном DOM CoC2;
- Defender, SmartScreen, Gatekeeper, Developer ID/Authenticode и нотариальное заверение публичного релиза.
