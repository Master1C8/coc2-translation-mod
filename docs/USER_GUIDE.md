# CoC2 Translator — User Guide / Инструкция

## English

### Start

1. Close CoC2 if it is running.
2. On Windows, fully extract the ZIP and run `CoC2 Translator.exe`. On macOS, open `CoC2 Translator.app`; it uses CrossOver when available and otherwise Parallels Desktop.
3. In Parallels, keep Windows signed in and enable Shared Folders. If there is more than one VM, choose the Windows VM from the macOS dialog.
4. If automatic discovery fails, select the main `CoC II.exe` file in the runtime that opened.
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

The panel has only two states: expanded or collapsed. Auto-translate is directly below the language controls. AI connection settings appear only for OpenAI-compatible; Google stays compact. The game manifest supplies the default panel palette. Long settings scroll inside the panel. Progress, errors, and the retry button use a fixed-height area so translation updates do not resize the panel or move its controls. Long error messages scroll within that area. `Retry translation` stays in a separate fixed row and is disabled during translation and when there are no failed fragments. It retries only failed fragments still present on the current screen.

Automatic translation processes visible, newly visible, or changed blocks and pre-translates tooltip blocks already present in the DOM before hover. Other hidden interface text remains excluded. It pauses and cancels an active request when the game window is hidden.

The language selector uses the same 30 locales and order as VN Revival. English and `Auto translate: On` are selected on the first launch; later choices are preserved locally. The first network request still waits for the privacy choice.

### Translation services

The provider list contains exactly two choices:

- `Google Translate` works without an API key.
- `OpenAI-compatible` supports OpenCode Go, OpenCode Zen, OpenRouter, DeepSeek, LM Studio, and Custom.

Visible game text is sent to the selected service. Save slots, form controls, editable areas, and recognized standalone player names are excluded. A name already embedded in a full story sentence may still be sent.

At first network use, select `Allow auto-translate` or `Manual only`. The choice does not certify provider output: every machine translation remains unreviewed.

### OpenAI-compatible setup

1. Select `OpenAI-compatible`.
2. Choose a preset.
3. If the endpoint requires authentication, paste its key and press `Enter` or leave the field. The key is saved and replaces the previously stored key for this Base URL.
4. Open the model list to refresh it from the provider.
5. Choose a model from the single list. Free models are pinned first, and both the free and paid groups are alphabetical. OpenCode Go and Zen show only models documented for Chat Completions because their full catalogs also contain models for other incompatible APIs. Use `Enter model ID manually…` when the endpoint does not list the required ID.
6. In `Advanced`, optionally set reasoning effort; `Provider default` omits that parameter. Output verbosity is automatic: the translator requests `low`, then falls back to the provider default if unsupported. Choose `Parallel requests` from 1 to 8; the default is 4. Reduce it if the provider rate-limits requests.
7. Open the collapsed `Advanced` group, then click `System prompt` to edit it when needed. `{targetName}` and `{target}` are replaced with the selected language name and code. Use `Restore default` to recover the built-in instruction. After editing the prompt or glossary, delete the cache below to retranslate text that was already translated; the group displays the same reminder.
8. In the same `Advanced` group, click `Glossary` to add one preferred mapping per line, for example `Minstrel = Менестрель`. The saved glossary is appended to every AI system prompt automatically.

Preset Base URLs:

- OpenCode Go — `https://opencode.ai/zen/go/v1`
- OpenCode Zen — `https://opencode.ai/zen/v1`
- OpenRouter — `https://openrouter.ai/api/v1`
- DeepSeek — `https://api.deepseek.com`
- LM Studio — `http://127.0.0.1:1234/v1`

For Custom, enter a Base URL. Remote URLs must use HTTPS. HTTP is accepted only for `localhost` or another loopback address. A custom URL cannot contain credentials, a query, a fragment, or path traversal.

The key field is cleared and hidden after confirmed saving; `Key saved` and `Change` replace it. The preset address and model parameters are inside `Advanced`; Custom shows its address immediately. Keys are stored separately per Base URL in Windows Credential Manager or macOS Keychain; they are not saved in game settings, the DOM, or the translation cache. Entering another key replaces the stored key for the current endpoint.

LM Studio is part of this same provider. Start its local server and load a model first; no key is required by the preset. If `/models` is unavailable but Chat Completions works, enter the model ID manually.

The helper validates response structure and context markers before applying text. If an endpoint explicitly rejects an optional model parameter, the helper retries without it. Provider HTTP 400/401 responses that identify an unavailable or unsupported model are reported as a model problem without exposing the raw upstream message. Temporary failures and rate limits are retried with a delay and `Retry-After`; the panel shows the safe final error, and an exhausted rate limit stops the remaining queue. Permanent provider rejections also stop the queue and pause automatic translation for the current settings until a manual retry, a change of translation settings or key, or toggling auto-translate. OpenCode Go requests include a stable routing session ID for the lifetime of the local service, shared across concurrent requests and format fallbacks; the client identifies itself as VN Revival Translator. This is not editorial review, and the result is not an approved localization.

### Cache and layout

Translations are cached automatically. OpenAI-compatible cache entries are separated by preset, Base URL, model, model parameters, prompt version, the complete system prompt, and the glossary. Changing the prompt, glossary, or parameters therefore does not reuse results produced with an older configuration. Old Google cache entries are migrated lazily. The maintenance block shows both cache and local-service log sizes. `Copy log` copies the log to the clipboard for diagnostics (the latest 2 MB when it is larger). After confirmation, `Clear cache and log` clears both the translation cache and log without resetting other settings.

The local service writes structured JSON lines for OpenAI-compatible requests: request IDs, separate provider and helper HTTP statuses, safe error categories, fallback attempts, duration, and token usage when returned by the provider (including cached input and reasoning tokens when available). Missing usage means unknown, not zero; usage is retained even if the translation fails validation. Text and configuration fingerprints help identify repeated requests without recording game text, translations, prompts, glossary contents, endpoint addresses, or keys. Cache hits and Google requests do not pass through this service and are not counted. Restart the translator after updating to enable the new logging; older entries cannot recover missing metrics.

RTL direction, language tags, font fallback, wrapping, and button sizing are applied only to translated text and restored before retranslation after a language or configuration change. Existing HTML elements and click handlers remain in place.

### Troubleshooting

If the panel does not appear, close CoC2 completely and start it through the translator again. If OpenAI-compatible says the local helper is unavailable, reinstall/extract the complete app instead of moving only the executable. Confirm that the endpoint supports OpenAI Chat Completions (`/models` and `/chat/completions`) and that the selected model ID is valid.

Closing CoC2 normally also ends the launcher and local helper.

For Parallels, the macOS app stages its bundled Windows launcher under
`~/Documents/VN Revival/Parallels/`, copies it to the guest's
`%LOCALAPPDATA%\VN Revival\Parallels\`, and starts it as the current Windows user.
The Windows launcher keeps CDP and the credential helper on guest loopback. If
both CrossOver and Parallels are installed, CrossOver remains the default;
advanced launches can select Parallels with
`VNREVIVAL_WINDOWS_RUNTIME=parallels` and a VM with
`VNREVIVAL_PARALLELS_VM="Windows 11"`.

---

## Русский

### Запуск

1. Закройте CoC2, если игра запущена.
2. На Windows полностью распакуйте ZIP и запустите `CoC2 Translator.exe`. На macOS откройте `CoC2 Translator.app`: при наличии CrossOver используется он, иначе Parallels Desktop.
3. Для Parallels войдите в Windows и включите Shared Folders. Если VM несколько, выберите нужную Windows VM в системном окне macOS.
4. Если автоматический поиск не сработал, укажите основной `CoC II.exe` в открывшейся среде.
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

У панели два состояния: развёрнутое и свёрнутое. Автоперевод расположен сразу под языком. Настройки ИИ появляются только для OpenAI-compatible; Google остаётся компактным. Палитра панели по умолчанию задаётся манифестом игры. Длинные настройки прокручиваются внутри панели. Прогресс, ошибки и кнопка повтора занимают область постоянной высоты: обновления перевода не меняют размер панели и не сдвигают элементы управления. Длинные сообщения об ошибках прокручиваются внутри этой области. «Повторить перевод» постоянно занимает отдельную строку и недоступна во время перевода и при отсутствии ошибок. Кнопка повторяет только непереведённые фрагменты, которые ещё находятся на текущем экране.

Автоперевод обрабатывает видимые, впервые появившиеся или изменённые блоки и заранее переводит уже присутствующие в DOM tooltip-блоки до наведения. Остальной скрытый интерфейс не обрабатывается. При скрытом окне таймер останавливается, активный запрос отменяется.

Список и порядок 30 языков совпадают с каталогом VN Revival. При первом запуске выбран английский и `Auto translate: On`; последующий выбор сохраняется локально. Первый сетевой запрос всё равно ожидает выбора режима приватности.

### Сервисы перевода

В списке ровно два варианта:

- `Google Translate` работает без API-ключа.
- `OpenAI-compatible` поддерживает OpenCode Go, OpenCode Zen, OpenRouter, DeepSeek, LM Studio и Custom.

Видимый игровой текст отправляется выбранному сервису. Слоты сохранения, формы, редактируемые области и распознанные отдельные имена игрока исключаются. Имя внутри цельного сюжетного предложения всё равно может попасть в запрос.

При первом сетевом использовании выберите `Allow auto-translate` или `Manual only`. Это разрешение на режим работы, а не одобрение ответа провайдера: машинный перевод остаётся непроверенным.

### Настройка OpenAI-compatible

1. Выберите `OpenAI-compatible`.
2. Выберите preset.
3. Если endpoint требует авторизацию, вставьте ключ и нажмите `Enter` или покиньте поле. Ключ сохранится и заменит прежний ключ этого Base URL.
4. Откройте список моделей, чтобы обновить его у провайдера.
5. Выберите модель в единственном списке. Бесплатные модели закреплены сверху, а бесплатная и платная группы отсортированы по алфавиту. Для OpenCode Go и Zen показываются только модели, документированные для Chat Completions: полные каталоги этих провайдеров также содержат модели для других несовместимых API. Для отсутствующего в каталоге ID используйте `Enter model ID manually…`.
6. При необходимости задайте reasoning effort; `Provider default` не отправляет этот параметр. Verbosity выбирается автоматически: переводчик запрашивает `low`, а при отсутствии поддержки использует default провайдера. В `Parallel requests` выберите от 1 до 8 одновременных запросов; по умолчанию — 4. Уменьшите значение, если провайдер ограничивает частоту запросов.
7. Откройте свёрнутую по умолчанию группу `Advanced`, затем при необходимости нажмите `System prompt`. Вместо `{targetName}` и `{target}` helper подставляет название и код выбранного языка. Кнопка `Restore default` возвращает встроенную инструкцию. После правки prompt или словаря удалите кэш внизу, чтобы уже обработанный текст перевёлся заново; в самой группе есть такое же напоминание.
8. В той же группе `Advanced` нажмите `Glossary` и добавьте по одной предпочтительной паре в строке, например `Minstrel = Менестрель`. Сохранённый словарь автоматически дописывается к системной инструкции каждого ИИ-запроса.

Base URL preset:

- OpenCode Go — `https://opencode.ai/zen/go/v1`
- OpenCode Zen — `https://opencode.ai/zen/v1`
- OpenRouter — `https://openrouter.ai/api/v1`
- DeepSeek — `https://api.deepseek.com`
- LM Studio — `http://127.0.0.1:1234/v1`

Для Custom введите Base URL. Удалённый адрес обязан использовать HTTPS. HTTP допустим только для `localhost` или другого loopback-адреса. В custom URL запрещены credentials, query, fragment и переход по пути `..`.

После подтверждённого сохранения поле ключа очищается и скрывается; вместо него показаны «Ключ сохранён» и «Изменить». Адрес готового профиля и параметры модели находятся в «Дополнительно»; для Custom адрес виден сразу. Ключи хранятся отдельно по Base URL в Windows Credential Manager или macOS Keychain и не попадают в игровые настройки, DOM или кэш. Ввод нового ключа заменяет сохранённый ключ текущего endpoint.

LM Studio входит в этот же провайдер. Сначала запустите local server и загрузите модель; preset не требует ключа. Если `/models` недоступен, но Chat Completions работает, введите model ID вручную.

Helper проверяет структуру ответа и контекстные маркеры перед применением. Если endpoint явно отклоняет optional model-параметр, helper повторяет запрос без него. HTTP 400/401, в котором provider сообщает о недоступной или неподдерживаемой модели, показывается как проблема модели без вывода сырого upstream message. Временные ошибки и rate limit автоматически повторяются с задержкой и `Retry-After`; панель показывает безопасную итоговую причину, а исчерпанный лимит останавливает оставшуюся очередь. Постоянные отказы провайдера также останавливают очередь и приостанавливают автоперевод с текущими настройками до ручного повтора, изменения настроек перевода или ключа либо переключения автоперевода. Запросы OpenCode Go передают единый идентификатор сессии маршрутизации на время работы локального сервиса, включая параллельные запросы и смену формата; клиент обозначает себя как VN Revival Translator. Эта проверка не является редактурой, а результат не становится одобренной локализацией.

### Кэш и оформление

Переводы кэшируются автоматически. Записи OpenAI-compatible разделены по preset, Base URL, модели, параметрам модели, версии, полному тексту системной инструкции и словарю. Поэтому после изменения prompt, словаря или параметров не используются ответы, созданные с прежней конфигурацией. Старые Google-записи мигрируют лениво. В блоке обслуживания показываются размеры кэша и лога локального сервиса. `Copy log` копирует лог в буфер обмена для диагностики (последние 2 МБ, если он больше). После подтверждения `Clear cache and log` очищает и кэш переводов, и лог, не сбрасывая остальные настройки.

Локальный сервис записывает запросы OpenAI-compatible строками JSON: идентификаторы запросов, отдельные HTTP-коды провайдера и helper, безопасные категории ошибок, попытки смены формата или параметров, длительность и расход токенов, если провайдер его сообщает. При наличии учитываются кэшированные входные токены и токены рассуждений. Отсутствие расхода означает «неизвестно», а не ноль; полученный расход сохраняется и при ошибке проверки перевода. Хеши текста и настроек позволяют находить повторные запросы без записи текста игры, переводов, инструкций, содержимого словаря, адресов endpoint и ключей. Попадания в кэш и запросы Google через этот сервис не проходят и здесь не учитываются. Для нового журнала перезапустите переводчик после обновления; восстановить недостающие метрики старых записей нельзя.

RTL, `lang`, шрифтовые fallback, переносы и размер кнопок применяются только к переводу и восстанавливаются перед повторным переводом при смене языка или конфигурации. Существующие HTML-элементы и обработчики кликов не заменяются.

### Решение проблем

Если панель не появилась, полностью закройте CoC2 и снова запустите игру через переводчик. Если OpenAI-compatible сообщает об отсутствии helper, переустановите или полностью распакуйте приложение, не переносите один EXE. Убедитесь, что endpoint поддерживает OpenAI Chat Completions (`/models` и `/chat/completions`) и model ID существует.

Обычное закрытие CoC2 завершает launcher и локальный helper.

В режиме Parallels macOS-приложение помещает комплектный Windows launcher в
`~/Documents/VN Revival/Parallels/`, копирует его в
`%LOCALAPPDATA%\VN Revival\Parallels\` гостевой системы и запускает от текущего
пользователя Windows. CDP и credential helper остаются на гостевом loopback. Если установлены
и CrossOver, и Parallels, по умолчанию сохраняется CrossOver; для ручного выбора
используйте `VNREVIVAL_WINDOWS_RUNTIME=parallels`, а имя VM можно задать через
`VNREVIVAL_PARALLELS_VM="Windows 11"`.
