# CoC2 Translator — User Guide / Инструкция

## English

### Start

1. Close CoC2 if it is running.
2. On Windows, fully extract the ZIP and run `CoC2 Translator.exe`. The same package supports Windows 10/11 x64 and Windows 11 on Arm; Windows uses its built-in x64 application emulation on Arm.
3. On macOS, install CrossOver, install the Windows version of CoC2 in a CrossOver bottle, and open `CoC2 Translator.app`. The macOS app does not use Parallels or a native macOS game build.
4. If automatic discovery fails, select the main `CoC II.exe` file in the CrossOver bottle or Windows installation that opened.
5. Wait for the panel in the top-right corner.

Always start CoC2 through the translator. It translates only the live DOM shown by the running game; it does not extract or modify game assets and does not create a static localization.

### Controls

- With auto-translate off, `Translate / Cancel` starts or stops the current screen pass. With auto-translate on, the manual button is hidden; errors appear only when they occur.
- The `Language` selector remains visible at the top of the panel.
- The `Translate panel interface` checkbox below the language selector localizes the translator panel with a bundled preset for the selected language. It never sends panel text to Google or AI; unsupported presets fall back to English. English and Russian presets are currently bundled.
- `Ctrl+Shift+T`, displayed inside the main button, performs the same translate/cancel action.
- Provider, auto-translate, and cache controls are always visible while the panel is expanded.
- Hold the pointer over a complex setting to see its short explanation.
- `− / +` collapses the panel to a single `+` button or expands it completely.
- Drag the space around the language controls in the top row to move the panel.

The panel has only two states: expanded or collapsed, and always starts expanded in a new game session. Auto-translate is directly below the language controls. AI connection settings appear only for OpenAI-compatible; Google stays compact. The game manifest supplies the default panel palette. Ordinary panel labels cannot be selected; text selection remains enabled in editable fields and text areas. Long settings scroll inside the panel. Progress, errors, and the retry button use a fixed-height area so translation updates do not resize the panel or move its controls. Long error messages scroll within that area. `Retry translation` stays in a separate fixed row and is disabled during translation and when there are no failed fragments. It retries only failed fragments still present on the current screen.

Automatic translation processes visible, newly visible, or changed blocks, including native selection options, and pre-translates recognized tooltip blocks already present in the DOM before hover. Other hidden interface text remains excluded. It pauses and cancels an active request when the game window is hidden.

The language selector uses the same 30 locales and order as VN Revival. English and `Auto translate: On` are selected on the first launch; later choices are preserved locally. There is no first-use confirmation dialog.

When the selected target matches the game's source language, the translator keeps the original text and creates no translation jobs or provider requests. CoC2's source language is English.

### Translation services

The provider list contains exactly two choices:

- `Google Translate` works without an API key.
- `OpenAI-compatible` supports OpenCode Go, OpenCode Zen, OpenRouter, DeepSeek, LM Studio, and Custom.

Visible game text is sent to the selected service. Native selection labels and options are included; save slots, text-entry controls, editable areas, and recognized standalone player names are excluded. A name already embedded in a full story sentence may still be sent.

Machine translation remains unreviewed regardless of the selected service or automatic/manual mode.

### OpenAI-compatible setup

1. Select `OpenAI-compatible`.
2. Choose a preset.
3. If the endpoint requires authentication, paste its key and press `Enter` or leave the field. The key is saved and replaces the previously stored key for this Base URL.
4. Open the model list to refresh it from the provider.
5. Choose a model from the single list. Free models are pinned first, and both the free and paid groups are alphabetical. OpenCode Go shows every model ID returned by its live `/models` catalog. Documented Go models are routed to Chat Completions, Responses, or Messages as required. OpenCode Zen remains limited to its supported Chat Completions models. Use `Enter model ID manually…` when the endpoint does not list the required ID.
   The help link immediately below the selector opens the `How it works` section of the CoC2 page on VN Revival in the system browser, outside the game's Electron window.
6. In `Advanced`, optionally set reasoning effort; `Provider default` omits that parameter. Output verbosity is automatic: the translator requests `low`, then falls back to the provider default if unsupported. Choose `Parallel requests` from 1 to 8; the default is 4. Reduce it if the provider rate-limits requests.
7. Open the collapsed `Advanced` group, then click `System prompt` to edit it when needed. The default prompt is loaded from VN Revival together with the selected language's glossary; `{targetName}` and `{target}` are replaced with the language name and code. A user edit becomes a local override, while `Restore default` returns to the current site version. If the site is temporarily unavailable, the app uses its bundled safe prompt.
8. The selected language's main glossary is loaded from VN Revival automatically. Open `Glossary` to see the exact downloaded entries and their count in a read-only field. Use `Local overrides` below it for your own mappings, one per line, for example `Minstrel = Менестрель`; a local mapping takes priority over the same site term. Only mappings whose source term occurs in the fragment are sent with it, ignoring case and normalizing spacing and Unicode. A free-form user instruction sends that user addition in full alongside only the relevant site mappings.

The VN Revival settings request goes through the local helper to a fixed HTTPS address. It sends only the game slug and selected locale to the site, never game text, an API key, or user settings. On a network error, translation continues with the bundled prompt and local additions.

Preset Base URLs:

- OpenCode Go — `https://opencode.ai/zen/go/v1`
- OpenCode Zen — `https://opencode.ai/zen/v1`
- OpenRouter — `https://openrouter.ai/api/v1`
- DeepSeek — `https://api.deepseek.com`
- LM Studio — `http://127.0.0.1:1234/v1`

For Custom, enter a Base URL. Remote URLs must use HTTPS. HTTP is accepted only for `localhost` or another loopback address. A custom URL cannot contain credentials, a query, a fragment, or path traversal.

The key field is cleared and hidden after confirmed saving; `Key saved` and `Change` replace it. The preset address and model parameters are inside `Advanced`; Custom shows its address immediately. Keys are stored separately per Base URL in Windows Credential Manager or macOS Keychain; they are not saved in game settings, the DOM, or the translation cache. Entering another key replaces the stored key for the current endpoint.

For a preset that requires a key, the model selector remains disabled until the key is saved. A missing key changes only the panel status: it does not clear, replace, or hide the game screen.

LM Studio is part of this same provider. Start its local server and load a model first; no key is required by the preset. If `/models` is unavailable but Chat Completions works, enter the model ID manually.

A previously selected model keeps its exact ID in the selector even when the provider temporarily omits it from `/models`. `Enter model ID manually…` is a separate action and is never used as a label for the current model.

For GLM-5.3-Flash through OpenCode Go, reasoning supports only Low, High, and Maximum (plus leaving the provider default unset). Previously saved unsupported levels, including Minimal and None, are migrated to Low. This is a model-specific constraint; other models retain their available settings. The helper also normalizes older clients and records the adjustment in the log.

The helper validates response structure and context markers before applying text. If an endpoint explicitly rejects an optional model parameter, the helper retries without it. Provider HTTP 400/401 responses that identify an unavailable or unsupported model are reported as a model problem without exposing the raw upstream message. Temporary failures and rate limits are retried with a delay and `Retry-After`; the panel shows the safe final error, and an exhausted rate limit stops the remaining queue. Permanent provider rejections also stop the queue and pause automatic translation for the current settings until a manual retry, a change of translation settings or key, or toggling auto-translate. OpenCode Go requests include a stable routing session ID for the lifetime of the local service, shared across concurrent requests and format fallbacks; the client identifies itself as VN Revival Translator. This is not editorial review, and the result is not an approved localization.

### Cache and layout

AI translation combines neighboring paragraphs into large blocks and displays each completed block at once, preserving emphasis, links and paragraph order. A small scene can fit into one request; longer scenes are split into bounded blocks. Controls are grouped separately. Cached paragraphs are reused individually: a changed paragraph does not require retranslating the whole scene. A larger block may take longer to start appearing than a single paragraph. If the game changes any of its text while waiting, the old block is not applied. If batch separators are damaged, missing original blocks are retried separately; successful translations remain cached if a later block fails. Provider rejections such as HTTP 400 do not trigger this fallback.

Translations are cached automatically. OpenAI-compatible cache entries are separated by preset, Base URL, model, model parameters, prompt version, the complete system prompt, and the glossary entries relevant to the source fragment. Changing a glossary term preserves unrelated cached and displayed translations. Changing the prompt or model parameters requires a new translation with those settings. Old Google cache entries are migrated lazily. The maintenance block shows both cache and local-service log sizes. `Copy log` copies the log to the clipboard for diagnostics (the latest 2 MB when it is larger). After confirmation, `Clear cache and log` clears both the translation cache and log without resetting other settings.

The local service writes structured JSON lines for OpenAI-compatible requests: request IDs, separate provider and helper HTTP statuses, safe error categories, fallback attempts, duration, token usage, and the USD cost reported by the provider when available. This includes cached input and reasoning tokens when returned. Missing usage or cost means unknown, not zero; a reported zero cost remains a known zero. Usage is retained even if the translation fails validation. Text and configuration fingerprints help identify repeated requests without recording game text, translations, prompts, glossary contents, endpoint addresses, or keys. For AI translation, `screen.start` and `screen.result` also record one queue pass: cache hits, requests, batch fallbacks, token totals, `reported_cost_usd`, how many responses supplied usage and cost, maximum queue wait, time until the first DOM translation (`first_apply_ms`), first story fragment (`first_story_ms`), and total duration. Times start when the queue begins, excluding auto-translation debounce and preflight. A null cost means the provider did not supply one; it is never estimated from a potentially stale price table. A null first-translation time means nothing of that type was applied. This measures DOM updates, not rendered frames; a changing game screen may produce several queue passes. `screen_id` on `translation.start` links request usage to its pass. Google requests are not logged. Restart the translator after updating to enable the new logging; older entries cannot recover missing metrics.

RTL direction, language tags, font fallback, wrapping, and button sizing are applied only to translated text and restored before retranslation after a language or configuration change. Existing HTML elements and click handlers remain in place.

### Troubleshooting

If the panel does not appear, close CoC2 completely and start it through the translator again. If OpenAI-compatible says the local helper is unavailable, reinstall/extract the complete app instead of moving only the executable. Confirm that the endpoint supports `/models` and the API required by the selected model: `/chat/completions`, `/responses`, or `/messages`. On OpenCode Go, GPT-5.6 Luna uses `/responses`; MiniMax and Qwen models use `/messages`. Also confirm that the selected model ID is valid.

On Windows and in CrossOver, the translator starts a detected Steam copy through Steam even when the client was initially closed, and waits up to two minutes for the game. It never falls back to launching a Steam game EXE directly. If Steam needs an update or sign-in, complete it and start the translator again.

Closing CoC2 normally also ends the launcher and local helper.

The macOS application requires CrossOver and starts only the Windows version of
CoC2 installed in a CrossOver bottle. It contains no Parallels fallback or
embedded Windows launcher payload.

---

## Русский

### Запуск

1. Закройте CoC2, если игра запущена.
2. На Windows полностью распакуйте ZIP и запустите `CoC2 Translator.exe`. Один пакет поддерживает Windows 10/11 x64 и Windows 11 on Arm; на Arm используется встроенная в Windows эмуляция x64-приложений.
3. На macOS установите CrossOver, установите Windows-версию CoC2 в бутылку CrossOver и откройте `CoC2 Translator.app`. macOS-приложение не использует Parallels и нативную macOS-версию игры.
4. Если автоматический поиск не сработал, укажите основной `CoC II.exe` в бутылке CrossOver или открывшейся установке Windows.
5. Дождитесь панели в правом верхнем углу.

Всегда запускайте CoC2 через переводчик. Он обрабатывает только живой DOM работающей игры, не извлекает и не меняет игровые ассеты и не создаёт статическую локализацию.

### Управление

- При выключенном автопереводе `Translate / Cancel` запускает или отменяет перевод текущего экрана. При включённом автопереводе ручная кнопка скрыта; сообщения об ошибках появляются по мере возникновения.
- Список `Language` постоянно виден в верхней части панели.
- Галочка `Переводить интерфейс панели` под языком переводит панель встроенным пресетом выбранного языка. Текст панели никогда не отправляется Google или ИИ; при отсутствии пресета используется английский. Сейчас встроены английский и русский пресеты.
- `Ctrl+Shift+T`, указанная внутри основной кнопки, выполняет то же действие перевода/отмены.
- Провайдер, автоперевод и кэш всегда видны в развёрнутой панели.
- Задержите курсор над сложной настройкой, чтобы увидеть её краткое пояснение.
- `− / +` сворачивает панель до одной кнопки `+` или полностью разворачивает её.
- Свободное место в верхней строке с языком позволяет перемещать панель.

У панели два состояния: развёрнутое и свёрнутое, при каждом новом запуске игры она всегда открывается развёрнутой. Автоперевод расположен сразу под языком. Настройки ИИ появляются только для OpenAI-compatible; Google остаётся компактным. Палитра панели по умолчанию задаётся манифестом игры. Обычные надписи панели не выделяются; в полях ввода и текстовых областях выделение остаётся доступным. Длинные настройки прокручиваются внутри панели. Прогресс, ошибки и кнопка повтора занимают область постоянной высоты: обновления перевода не меняют размер панели и не сдвигают элементы управления. Длинные сообщения об ошибках прокручиваются внутри этой области. «Повторить перевод» постоянно занимает отдельную строку и недоступна во время перевода и при отсутствии ошибок. Кнопка повторяет только непереведённые фрагменты, которые ещё находятся на текущем экране.

Автоперевод обрабатывает видимые, впервые появившиеся или изменённые блоки, включая пункты нативных списков, и заранее переводит уже присутствующие в DOM распознанные tooltip-блоки до наведения. Остальной скрытый интерфейс не обрабатывается. При скрытом окне таймер останавливается, активный запрос отменяется.

Список и порядок 30 языков совпадают с каталогом VN Revival. При первом запуске выбран английский и `Auto translate: On`; последующий выбор сохраняется локально. Отдельного подтверждения при первом использовании нет.

Если выбранный язык перевода совпадает с исходным языком игры, переводчик сохраняет оригинальный текст и не создаёт задания или запросы к провайдеру. Исходный язык CoC2 — английский.

### Сервисы перевода

В списке ровно два варианта:

- `Google Translate` работает без API-ключа.
- `OpenAI-compatible` поддерживает OpenCode Go, OpenCode Zen, OpenRouter, DeepSeek, LM Studio и Custom.

Видимый игровой текст отправляется выбранному сервису. Подписи и пункты нативных списков включаются; слоты сохранения, поля текстового ввода, редактируемые области и распознанные отдельные имена игрока исключаются. Имя внутри цельного сюжетного предложения всё равно может попасть в запрос.

Машинный перевод остаётся непроверенным независимо от выбранного сервиса и автоматического или ручного режима.

### Настройка OpenAI-compatible

1. Выберите `OpenAI-compatible`.
2. Выберите preset.
3. Если endpoint требует авторизацию, вставьте ключ и нажмите `Enter` или покиньте поле. Ключ сохранится и заменит прежний ключ этого Base URL.
4. Откройте список моделей, чтобы обновить его у провайдера.
5. Выберите модель в единственном списке. Бесплатные модели закреплены сверху, а бесплатная и платная группы отсортированы по алфавиту. Для OpenCode Go показываются все ID из актуального каталога `/models`; документированные модели направляются в Chat Completions, Responses или Messages в зависимости от требуемого протокола. Для OpenCode Zen по-прежнему показываются поддерживаемые модели Chat Completions. Для отсутствующего в каталоге ID используйте `Enter model ID manually…`.
   Ссылка «Как это работает» сразу под списком открывает одноимённый раздел страницы CoC2 на VN Revival в системном браузере, а не в окне игры.
6. При необходимости задайте reasoning effort; `Provider default` не отправляет этот параметр. Verbosity выбирается автоматически: переводчик запрашивает `low`, а при отсутствии поддержки использует default провайдера. В `Parallel requests` выберите от 1 до 8 одновременных запросов; по умолчанию — 4. Уменьшите значение, если провайдер ограничивает частоту запросов.
7. Откройте свёрнутую по умолчанию группу `Advanced`, затем при необходимости нажмите `System prompt`. Стандартный prompt загружается с VN Revival вместе с глоссарием выбранного языка; вместо `{targetName}` и `{target}` helper подставляет название и код языка. Пользовательская правка становится локальным override, а `Restore default` возвращает текущую версию с сайта. Если сайт временно недоступен, приложение использует комплектный безопасный prompt.
8. Основной глоссарий выбранного языка загружается с VN Revival автоматически. Откройте `Глоссарий`, чтобы увидеть точные загруженные строки и их количество в read-only поле. Свои пары добавляйте ниже в `Локальные замены`, например `Minstrel = Менестрель`; они имеют приоритет над совпадающим термином с сайта. В запрос включаются только пары, исходный термин которых встречается во фрагменте: регистр, пробелы и Unicode нормализуются. Если пользовательская строка содержит произвольную инструкцию вместо пары, целиком передаётся только пользовательское дополнение плюс относящиеся к фрагменту строки сайта.

Загрузка настроек VN Revival проходит через локальный helper по фиксированному HTTPS-адресу. Она передаёт сайту только slug игры и выбранную локаль, но не текст игры, API-ключ или содержимое пользовательских настроек. При ошибке сети перевод продолжает работать со встроенным prompt и локальными дополнениями.

Base URL preset:

- OpenCode Go — `https://opencode.ai/zen/go/v1`
- OpenCode Zen — `https://opencode.ai/zen/v1`
- OpenRouter — `https://openrouter.ai/api/v1`
- DeepSeek — `https://api.deepseek.com`
- LM Studio — `http://127.0.0.1:1234/v1`

Для Custom введите Base URL. Удалённый адрес обязан использовать HTTPS. HTTP допустим только для `localhost` или другого loopback-адреса. В custom URL запрещены credentials, query, fragment и переход по пути `..`.

После подтверждённого сохранения поле ключа очищается и скрывается; вместо него показаны «Ключ сохранён» и «Изменить». Адрес готового профиля и параметры модели находятся в «Дополнительно»; для Custom адрес виден сразу. Ключи хранятся отдельно по Base URL в Windows Credential Manager или macOS Keychain и не попадают в игровые настройки, DOM или кэш. Ввод нового ключа заменяет сохранённый ключ текущего endpoint.

Для preset, которому нужен ключ, список моделей остаётся недоступным до сохранения ключа. Отсутствие ключа меняет только статус в панели: игровой экран не очищается, не заменяется и не скрывается.

LM Studio входит в этот же провайдер. Сначала запустите local server и загрузите модель; preset не требует ключа. Если `/models` недоступен, но Chat Completions работает, введите model ID вручную.

Ранее выбранная модель сохраняет в списке свой точный ID, даже если провайдер временно не вернул её через `/models`. «Ввести ID модели вручную…» — отдельное действие, а не обозначение текущей модели.

Для GLM-5.3-Flash через OpenCode Go поддерживаются только низкая, высокая и максимальная глубина рассуждений; также можно оставить значение провайдера по умолчанию. Сохранённые неподдерживаемые уровни, включая «Минимальная» и «Нет», заменяются на «Низкая». Это ограничение конкретной модели; остальные модели сохраняют свои настройки. Локальный сервис также корректирует запросы старых клиентов и записывает изменение параметра в лог.

Helper проверяет структуру ответа и контекстные маркеры перед применением. Если endpoint явно отклоняет optional model-параметр, helper повторяет запрос без него. HTTP 400/401, в котором provider сообщает о недоступной или неподдерживаемой модели, показывается как проблема модели без вывода сырого upstream message. Временные ошибки и rate limit автоматически повторяются с задержкой и `Retry-After`; панель показывает безопасную итоговую причину, а исчерпанный лимит останавливает оставшуюся очередь. Постоянные отказы провайдера также останавливают очередь и приостанавливают автоперевод с текущими настройками до ручного повтора, изменения настроек перевода или ключа либо переключения автоперевода. Запросы OpenCode Go передают единый идентификатор сессии маршрутизации на время работы локального сервиса, включая параллельные запросы и смену формата; клиент обозначает себя как VN Revival Translator. Эта проверка не является редактурой, а результат не становится одобренной локализацией.

### Кэш и оформление

ИИ-перевод объединяет соседние абзацы в крупные блоки и показывает каждый готовый блок целиком, сохраняя выделения, ссылки и порядок абзацев. Небольшая сцена может поместиться в один запрос; длинная разделяется на ограниченные по размеру блоки. Элементы управления группируются отдельно. Кэш переиспользуется по абзацам: изменение одного абзаца не требует заново переводить всю сцену. Крупный блок может появиться позже, чем один отдельный абзац. Если игра изменила его текст во время ожидания, старый блок не применяется. При повреждении разделителей недостающие исходные блоки повторяются отдельно; успешные переводы сохраняются в кэше при последующем сбое. Отказ провайдера вроде HTTP 400 не запускает такой повтор.

Переводы кэшируются автоматически. Записи OpenAI-compatible разделены по preset, Base URL, модели, параметрам модели, версии, полному тексту системной инструкции и записям словаря, относящимся к исходному фрагменту. Правка термина сохраняет кэш и уже показанные переводы, которых этот термин не касается. Смена prompt или параметров модели требует перевода с новыми настройками. Старые Google-записи мигрируют лениво. В блоке обслуживания показываются размеры кэша и лога локального сервиса. `Copy log` копирует лог в буфер обмена для диагностики (последние 2 МБ, если он больше). После подтверждения `Clear cache and log` очищает и кэш переводов, и лог, не сбрасывая остальные настройки.

Локальный сервис записывает запросы OpenAI-compatible строками JSON: идентификаторы запросов, отдельные HTTP-коды провайдера и helper, безопасные категории ошибок, попытки смены формата или параметров, длительность, расход токенов и сообщённую провайдером стоимость в USD. При наличии учитываются кэшированные входные токены и токены рассуждений. Отсутствие usage или стоимости означает «неизвестно», а не ноль; сообщённый ноль остаётся известным нулём. Полученный расход сохраняется и при ошибке проверки перевода. Хеши текста и настроек позволяют находить повторные запросы без записи текста игры, переводов, инструкций, содержимого словаря, адресов endpoint и ключей. Для ИИ-перевода события `screen.start` и `screen.result` также измеряют один проход очереди: попадания в кэш, запросы, откаты пакетного перевода, суммы токенов, `reported_cost_usd`, число ответов с usage и стоимостью, максимальное ожидание в очереди, время до первого обновлённого текста (`first_apply_ms`), первого сюжетного фрагмента (`first_story_ms`) и общую длительность. Отсчёт начинается при запуске очереди, после задержки автоперевода и проверки настроек. `null` в стоимости означает, что провайдер её не прислал; по потенциально устаревшей таблице тарифов она не вычисляется. `null` во времени означает отсутствие применённого текста этого типа. Это время изменения DOM, а не отрисовки кадра; один меняющийся игровой экран может вызвать несколько проходов. Поле `screen_id` в `translation.start` связывает расход токенов запроса с проходом. Запросы Google не журналируются. Для нового журнала перезапустите переводчик после обновления; восстановить недостающие метрики старых записей нельзя.

RTL, `lang`, шрифтовые fallback, переносы и размер кнопок применяются только к переводу и восстанавливаются перед повторным переводом при смене языка или конфигурации. Существующие HTML-элементы и обработчики кликов не заменяются.

### Решение проблем

Если панель не появилась, полностью закройте CoC2 и снова запустите игру через переводчик. Если OpenAI-compatible сообщает об отсутствии helper, переустановите или полностью распакуйте приложение, не переносите один EXE. Убедитесь, что endpoint поддерживает `/models` и нужный выбранной модели API: `/chat/completions`, `/responses` или `/messages`. В OpenCode Go GPT-5.6 Luna использует `/responses`, а модели MiniMax и Qwen — `/messages`. Также проверьте, что model ID существует.

В Windows и CrossOver переводчик запускает найденную Steam-копию через Steam, даже если клиент изначально был закрыт, и ждёт игру до двух минут. Прямого запуска EXE Steam-игры как запасного варианта больше нет. Если Steam требует обновления или входа, завершите этот шаг и снова запустите переводчик.

Обычное закрытие CoC2 завершает launcher и локальный helper.

macOS-приложение требует CrossOver и запускает только Windows-версию CoC2,
установленную в бутылку CrossOver. В приложении нет fallback на Parallels и
вложенного Windows launcher payload.
