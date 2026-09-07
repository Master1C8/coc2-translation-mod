# Архитектура

```text
game.json
  → задаёт идентичность CoC2, Steam/App/процесс, пути и строгие CDP target matchers
CoC2 Translator.app / CoC2 Translator.exe
  → на Windows/CrossOver запускает credential-backed helper и CoC2 напрямую
  → на macOS без CrossOver запускает комплектный Windows launcher внутри Parallels VM
  → держит Electron remote debugging только на loopback той же ОС/VM
  → контроллер выбирает только совпавшую CoC2 page и внедряет translator.bundle.js
translator.bundle.js
  → core + languages + providers + generated game config + CoC2 adapter + runtime
runtime
  → наблюдает видимый/изменённый DOM → кэш → Google или OpenAI-compatible → Text-узлы
```

Это исключительно runtime/realtime DOM-переводчик. В проекте нет чтения, извлечения или изменения ассетов игры, статического translation pack, Workbench, массовой обработки каталогов, выбора игр либо логики другого игрового продукта.

## Слои

- `src/translation-core.js`, `src/languages.js`, `src/providers.js` и `src/translator-runtime.js` — общее браузерное ядро;
- `src/games/coc2/game.json` — единый источник идентичности, запуска, путей и namespace;
- `src/games/coc2/adapter.js` — только DOM-правила CoC2;
- `src/local_service.py` — аутентифицированный loopback helper для credential vault и OpenAI-compatible HTTP;
- `src/controller/main.swift` и платформенные лаунчеры — CDP-инъекция и lifecycle.

`launchStrategy` остаётся равной `electron-cdp`; неизвестная стратегия отклоняется сборкой. Контроллер требует совпадения title или URL из манифеста и не внедряется в произвольную Electron-страницу.

`src/languages.js` повторяет единый 30-язычный каталог VN Revival в том же порядке и с теми же кодами. Для первой загрузки без сохранённых настроек runtime выбирает `en`; корректный последующий выбор пользователя сохраняется.

## DOM-проход

Текстовые контейнеры регистрируются один раз. `IntersectionObserver` сообщает о приближении блока к viewport, а `MutationObserver` ставит в очередь изменённые React-узлы. Tooltip-контейнеры, уже присутствующие в DOM, допускаются в фоновую очередь даже вне viewport и до наведения; остальные скрытые элементы по-прежнему исключаются. Автопроход не повторяет полный `TreeWalker` на каждой прокрутке. В старом Chromium используется scroll-fallback.

При `document.hidden` таймер останавливается и активный запрос отменяется. После возвращения видимые контейнеры снова ставятся в очередь. Ручной `Translate` или `Ctrl+Shift+T` запускает текущий проход; повторное действие вызывает `AbortController`.

Слоты сохранения, формы, редактируемые элементы, служебные блоки и распознанные имена игрока исключаются адаптером и ядром. Имя, уже включённое игрой в цельную сюжетную строку, отделить от предложения невозможно.

## Контекст без замены HTML

Соседние `Text`-узлы логического блока объединяются маркерами `VRCTXSEP…X`. Перевод разбирается по этим маркерам и записывается обратно в существующие узлы. `innerHTML`, DOM-элементы и обработчики не заменяются. Повреждённые или переставленные маркеры отклоняются; runtime повторяет этот блок по отдельным фрагментам.

Исходные атрибуты и inline-стили сохраняются до применения перевода. При смене языка или конфигурации runtime возвращает исходный текст, `lang`, `dir`, выравнивание, line-height, font-family, высоту и переносы перед повторным переводом.

## Провайдеры

Реестр `src/providers.js` содержит ровно два варианта:

- `google` — публичный endpoint без API-ключа;
- `openai-compatible` — от одного до восьми параллельных запросов через локальный helper; пользовательское значение по умолчанию — четыре.

OpenAI-compatible включает preset OpenCode Go, OpenCode Zen, OpenRouter, DeepSeek, LM Studio и Custom. Runtime сохраняет preset, Base URL, model ID, редактируемый шаблон системного prompt, пользовательский словарь, параметры модели (reasoning effort и verbosity) и отдельный лимит параллельных запросов. Лимит влияет только на число workers и не входит в payload или cache variant. Непустой словарь дописывается к шаблону перед каждым запросом; шаблон поддерживает `{targetName}` и `{target}`, которые helper заменяет выбранным языком. Открытие model picker вызывает `GET /models`; единый безопасный select закрепляет бесплатные модели сверху, сортирует обе группы по алфавиту и оставляет отдельный пункт для ручного ID. Поскольку каталоги OpenCode Go и Zen смешивают модели для нескольких wire protocol, helper пропускает в select только модели, документированные для Chat Completions. Перевод использует `POST /chat/completions`; временные отказы повторяются с exponential backoff и `Retry-After`, а исчерпанный rate limit останавливает оставшуюся очередь вместо серии бесполезных запросов.

Helper сначала просит JSON Schema. При явном отказе endpoint от этого формата он
переходит на `json_object`, а при ещё одном явном отказе — на запрос без
`response_format`. Он принимает объект `translation`, fenced JSON либо непустой
plain text, но затем обязательно проверяет контекстные маркеры. Возвращаемое
поле `reviewed: false` и UI прямо обозначают, что технически валидный машинный
результат не является редакторски проверенной или одобренной локализацией.
Optional model-параметры отправляются только при выбранном значении. Если HTTP
400 явно называет один из них неподдерживаемым, helper удаляет его и повторяет
тот же запрос. Другие ошибки не запускают этот fallback.
Известные безопасные причины upstream-отказа классифицируются без возврата
сырого provider message: в частности, gateway HTTP 400/401 с недоступной или
неподдерживаемой моделью становится `openai_model_unavailable`, а не локальным
502 или ошибкой ключа.

## Секреты и сеть

`src/local_service.py` слушает только `127.0.0.1`, требует одноразовый токен запуска и ограничивает размеры запросов/ответов. API-ключ передаётся helper один раз при сохранении и затем очищается из поля панели. JavaScript игры не получает сохранённый ключ обратно.

Каждый нормализованный Base URL получает отдельную credential identity на основе SHA-256:

- macOS — Keychain generic password;
- Windows — Credential Manager generic credential.

Секрет не попадает в командную строку, URL, `localStorage`, IndexedDB или переводный кэш. Внешний запрос передаёт его только в `Authorization: Bearer`.

Custom URL отклоняется при наличии credentials, query, fragment, управляющих символов или `..`. Удалённый endpoint обязан использовать HTTPS. HTTP разрешён только для точного `localhost` либо loopback IP, включая IPv4/IPv6. Локальный helper также доступен runtime только по `http://127.0.0.1:<port>` с валидным токеном.

## Кэш

IndexedDB хранит полный кэш; RAM-кэш — LRU на 20 000 записей. V3-ключ включает `game-id`, provider и language. Для OpenAI-compatible используется v4: fingerprint включает preset, Base URL, model ID, параметры модели, версию, полный текст системного prompt и словарь, поэтому смена endpoint, модели, параметров, инструкции или словаря не подменяет новый результат старым.

Существующие CoC2 Google-ключи v1/v2 читаются как fallback и лениво заменяются v3 после успешной записи. Для OpenAI-compatible legacy fallback не применяется. Метаданные количества/байтов защищены dirty-маркером и при расхождении восстанавливаются потоковым курсором.

JSONL export/import читает IndexedDB пакетами по 250 элементов. Импорт проверяет game/provider/language через парсеры ключей, которые понимают v1–v4.

## Launcher-инварианты

Windows-лаунчер остаётся нативным Win32 x86-64 GUI без консоли и прав администратора. Он использует сохранённый путь, ищет Steam-библиотеки и AppID, показывает `GetOpenFileNameW`, запускает embeddable Python helper, подключается через WinHTTP WebSocket и завершает helper при закрытии игры или исчезновении CDP target три проверки подряд.

macOS launcher выбирает CrossOver при его наличии, иначе Parallels Desktop. В
CrossOver сохраняются системный выбор файла и путь по `game-id`; локальный helper
запускается системным Python при его наличии. В Parallels приложение помещает
комплектный Windows payload в версионированную папку Documents, зеркалирует его
в `%LOCALAPPDATA%` гостевой Windows, выбирает единственную VM автоматически либо показывает системный список, при
необходимости запускает VM и вызывает Windows launcher через `prlctl exec
--current-user`. Windows launcher внутри гостя владеет helper, Steam discovery,
выбором EXE, CDP-инъекцией и lifecycle. Поэтому гостевой CDP не пробрасывается на
host и остаётся на `127.0.0.1`.

Windows ZIP и Parallels payload содержат только официальный embeddable Python и standard-library helper — переводческих движков, моделей и дополнительных runtime-пакетов нет. Сборка macOS по-прежнему объединяет `arm64` и `x86_64`, поддерживает ad-hoc/Developer ID signing и нотариальное заверение; Windows поддерживает Authenticode. `VNREVIVAL_APP_ONLY=1` создаёт проверяемую локальную `.app` с Parallels payload, но без релизных архивов.
