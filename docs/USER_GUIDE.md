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

- `Translate / Cancel` starts or stops the current screen pass.
- `Original / Translation` switches existing DOM text between English and the cached translation.
- `Ctrl+Shift+T`, displayed inside the main button, performs the same translate/cancel action.
- `...` opens settings.
- `− / +` collapses or expands the panel.
- Drag the top bar to move the panel.

Automatic translation processes only visible, newly visible, or changed blocks. It pauses and cancels an active request when the game window is hidden.

The language selector uses the same 30 locales and order as VN Revival. English is selected on the first launch; later choices are preserved locally.

### Translation services

The provider list contains exactly two choices:

- `Google Translate` works without an API key.
- `OpenAI-compatible` supports OpenCode Go, OpenCode Zen, OpenRouter, DeepSeek, LM Studio, and Custom.

Visible game text is sent to the selected service. Save slots, form controls, editable areas, and recognized standalone player names are excluded. A name already embedded in a full story sentence may still be sent.

At first network use, select `Allow auto-translate` or `Manual only`. The choice does not certify provider output: every machine translation remains unreviewed.

### OpenAI-compatible setup

1. Select `OpenAI-compatible`.
2. Choose a preset.
3. If the endpoint requires authentication, paste its key and click `Save API key`.
4. Click `Refresh models`.
5. Choose a listed model suggestion or type the exact model ID manually.

Preset Base URLs:

- OpenCode Go — `https://opencode.ai/zen/go/v1`
- OpenCode Zen — `https://opencode.ai/zen/v1`
- OpenRouter — `https://openrouter.ai/api/v1`
- DeepSeek — `https://api.deepseek.com`
- LM Studio — `http://127.0.0.1:1234/v1`

For Custom, enter a Base URL. Remote URLs must use HTTPS. HTTP is accepted only for `localhost` or another loopback address. A custom URL cannot contain credentials, a query, a fragment, or path traversal.

The key field is cleared after saving. Keys are stored separately per Base URL in Windows Credential Manager or macOS Keychain; they are not saved in game settings, the DOM, or the translation cache. `Remove key` removes the current endpoint's key.

LM Studio is part of this same provider. Start its local server and load a model first; no key is required by the preset. If `/models` is unavailable but Chat Completions works, enter the model ID manually.

The helper validates response structure and context markers before applying text. This is not editorial review, and the result is not an approved localization.

### Cache and layout

Translations are cached automatically. OpenAI-compatible cache entries are separated by preset, Base URL, model, and prompt version. Old Google cache entries are migrated lazily. Settings show cache size; no manual cache-management buttons are exposed.

RTL direction, language tags, font fallback, wrapping, and button sizing are applied only to translated text and restored by `Original` or a configuration change. Existing HTML elements and click handlers remain in place.

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

- `Translate / Cancel` запускает или отменяет перевод текущего экрана.
- `Original / Translation` переключает английский текст и кэшированный перевод.
- `Ctrl+Shift+T`, указанная внутри основной кнопки, выполняет то же действие перевода/отмены.
- `...` открывает настройки.
- `− / +` сворачивает или разворачивает панель.
- Верхняя полоса перемещает панель.

Автоперевод обрабатывает только видимые, впервые появившиеся или изменённые блоки. При скрытом окне таймер останавливается, активный запрос отменяется.

Список и порядок 30 языков совпадают с каталогом VN Revival. При первом запуске выбран английский; последующий выбор сохраняется локально.

### Сервисы перевода

В списке ровно два варианта:

- `Google Translate` работает без API-ключа.
- `OpenAI-compatible` поддерживает OpenCode Go, OpenCode Zen, OpenRouter, DeepSeek, LM Studio и Custom.

Видимый игровой текст отправляется выбранному сервису. Слоты сохранения, формы, редактируемые области и распознанные отдельные имена игрока исключаются. Имя внутри цельного сюжетного предложения всё равно может попасть в запрос.

При первом сетевом использовании выберите `Allow auto-translate` или `Manual only`. Это разрешение на режим работы, а не одобрение ответа провайдера: машинный перевод остаётся непроверенным.

### Настройка OpenAI-compatible

1. Выберите `OpenAI-compatible`.
2. Выберите preset.
3. Если endpoint требует авторизацию, вставьте ключ и нажмите `Save API key`.
4. Нажмите `Refresh models`.
5. Выберите подсказанный model ID или введите точный ID вручную.

Base URL preset:

- OpenCode Go — `https://opencode.ai/zen/go/v1`
- OpenCode Zen — `https://opencode.ai/zen/v1`
- OpenRouter — `https://openrouter.ai/api/v1`
- DeepSeek — `https://api.deepseek.com`
- LM Studio — `http://127.0.0.1:1234/v1`

Для Custom введите Base URL. Удалённый адрес обязан использовать HTTPS. HTTP допустим только для `localhost` или другого loopback-адреса. В custom URL запрещены credentials, query, fragment и переход по пути `..`.

После сохранения поле ключа очищается. Ключи хранятся отдельно по Base URL в Windows Credential Manager или macOS Keychain и не попадают в игровые настройки, DOM или кэш. `Remove key` удаляет ключ текущего endpoint.

LM Studio входит в этот же провайдер. Сначала запустите local server и загрузите модель; preset не требует ключа. Если `/models` недоступен, но Chat Completions работает, введите model ID вручную.

Helper проверяет структуру ответа и контекстные маркеры перед применением. Эта проверка не является редактурой, а результат не становится одобренной локализацией.

### Кэш и оформление

Переводы кэшируются автоматически. Записи OpenAI-compatible разделены по preset, Base URL, модели и версии инструкции. Старые Google-записи мигрируют лениво. В настройках виден объём кэша; ручных кнопок управления кэшем нет.

RTL, `lang`, шрифтовые fallback, переносы и размер кнопок применяются только к переводу и восстанавливаются через `Original` или при смене конфигурации. Существующие HTML-элементы и обработчики кликов не заменяются.

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
