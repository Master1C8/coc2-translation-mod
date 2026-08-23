# CoC2 Translator — User Guide / Инструкция

## English

### Starting the mod

1. Close CoC2 if it is already running.
2. On Windows, fully extract the ZIP and run `CoC2 Translator.exe`. On macOS, open `CoC2 Translator.app`.
3. The translator starts CoC2 for you. If it cannot find the game, choose the main `CoC II.exe` file when asked.
4. Wait for the translator panel to appear in the top-right corner of the game.

Always start the game through CoC2 Translator. The panel cannot appear if CoC2 was started normally.

### Main controls

- `Translate` translates the text currently visible on the screen. While it is working, the button changes to `Cancel`.
- `Original / Translation` switches between the original English text and the saved translation.
- `...` opens the settings.
- `− / +` collapses the panel into a thin bar or expands it again. This choice is remembered.
- `Ctrl+Shift+T` starts or cancels translation.
- Drag the panel by its top bar to move it. Its position is remembered.

### Choosing a translation service and language

Open the settings with `...`. First choose `Translation service`, then choose `Language`. These settings and the automatic-translation checkbox are saved as soon as you change them. There is no separate Save button.

- `Google Translate` works online. Its quality and speed are average. It usually works fine, but Google may temporarily limit requests.
- `Gemini AI` usually gives the best and fastest contextual translation. It needs an internet connection and your own Gemini API key. Free-tier content may be used by Google to improve its products, and some explicit scenes may still be blocked.
- `MyMemory` is a fast online service, but its quality can be poor. The mod lists 249 language codes, but MyMemory does not guarantee machine translation for every pair.
- `Argos Offline` runs on your computer and does not send game text online. It is slower, its quality is lower, and it supports fewer languages. Internet is needed to install the engine or a language model; translation works offline after installation.

Google, Gemini, and MyMemory send visible game text to the selected online service. Save slots and input fields are excluded. A player name that is already part of a complete story sentence may still be included.

### Using Gemini AI

1. Select `Gemini AI`.
2. Create your own key in [Google AI Studio](https://aistudio.google.com/apikey).
3. Paste it into `Gemini API key`.
4. Click `Save API key`.

The field is cleared after saving. The key is stored in Windows Credential Manager or macOS Keychain, not in the game settings or translation cache. Use `Remove key` to delete it.

### Using Argos Offline

1. Select `Argos Offline`.
2. Choose a supported language.
3. Click `Install Argos and model` or `Download model`.
4. Wait until the status says that offline translation is ready.

The first installation may take several minutes. A language model usually needs about 80–250 MB. Use `Remove model` if you no longer need the selected model.

### Automatic and manual translation

Enable `Automatically translate new screens` to translate new visible text as it appears. When an online service is selected for the first time, choose `Allow auto-translate` to allow sending visible text online, or `Manual only` to translate only when requested.

With automatic translation disabled, use `Translate` or `Ctrl+Shift+T`. The mod translates visible text and also handles newly visible blocks when you scroll.

### Cache and contacts

Translations are cached automatically. The settings show the number of saved translations and their size. The panel has no manual cache-management buttons.

At the bottom of the panel, use the icons next to VN Revival to open:

- [Discord](https://discord.gg/QgyeWW3Jg)
- [Telegram](https://t.me/VnRevival)
- [Email](mailto:master1c8@proton.me)

### Closing and troubleshooting

Close CoC2 normally. The translator and its local helper should exit automatically within a few seconds.

If an old panel appears after rebuilding the mod, close CoC2 completely, extract the newly built ZIP into a fresh folder, and run the translator from that folder. Rebuilding does not update a panel that is already injected into a running game.

If the panel does not appear, make sure CoC2 was closed before launch and that you started it through CoC2 Translator.

---

## Русский

### Запуск мода

1. Закройте CoC2, если игра уже запущена.
2. На Windows полностью распакуйте ZIP и запустите `CoC2 Translator.exe`. На macOS откройте `CoC2 Translator.app`.
3. Переводчик сам запустит CoC2. Если он не найдёт игру, укажите основной файл `CoC II.exe`.
4. Дождитесь появления панели переводчика в правом верхнем углу игры.

Всегда запускайте игру через CoC2 Translator. При обычном запуске CoC2 панель появиться не сможет.

### Основное управление

- `Translate` переводит текст, который сейчас виден на экране. Во время работы кнопка меняется на `Cancel`.
- `Original / Translation` переключает оригинальный английский текст и сохранённый перевод.
- `...` открывает настройки.
- `− / +` сворачивает панель до тонкой полосы или разворачивает её. Состояние запоминается.
- `Ctrl+Shift+T` запускает или отменяет перевод.
- Панель можно перемещать за верхнюю полоску. Позиция сохраняется.

### Выбор сервиса и языка

Откройте настройки кнопкой `...`. Сначала выберите `Translation service`, затем `Language`. Сервис, язык и флажок автоматического перевода сохраняются сразу после изменения. Отдельной кнопки Save нет.

- `Google Translate` работает через интернет. Качество и скорость средние. Обычно сервис работает нормально, но Google может временно ограничить запросы.
- `Gemini AI` обычно даёт самый качественный и быстрый контекстный перевод. Нужны интернет и собственный API-ключ Gemini. На бесплатном тарифе Google может использовать отправленный текст для улучшения продуктов, а отдельные откровенные сцены всё равно могут блокироваться.
- `MyMemory` — быстрый онлайн-сервис, но качество может быть низким. Мод показывает 249 языковых кодов, однако MyMemory не гарантирует машинный перевод для каждой пары.
- `Argos Offline` работает на компьютере и не отправляет игровой текст в интернет. Он медленнее, качество ниже, а языков доступно меньше. Для установки движка или языковой модели нужен интернет; после установки перевод работает офлайн.

Google, Gemini и MyMemory отправляют видимый текст игры выбранному онлайн-сервису. Слоты сохранения и поля ввода исключаются. Имя игрока, которое уже входит в цельное сюжетное предложение, тоже может попасть в запрос.

### Использование Gemini AI

1. Выберите `Gemini AI`.
2. Создайте собственный ключ в [Google AI Studio](https://aistudio.google.com/apikey).
3. Вставьте его в поле `Gemini API key`.
4. Нажмите `Save API key`.

После сохранения поле очищается. Ключ хранится в Windows Credential Manager или macOS Keychain, а не в настройках игры или кэше переводов. Кнопка `Remove key` удаляет ключ.

### Использование Argos Offline

1. Выберите `Argos Offline`.
2. Выберите поддерживаемый язык.
3. Нажмите `Install Argos and model` или `Download model`.
4. Дождитесь сообщения о готовности офлайн-перевода.

Первая установка может занять несколько минут. Языковая модель обычно занимает около 80–250 МБ. Кнопка `Remove model` удаляет выбранную модель.

### Автоматический и ручной перевод

Включите `Automatically translate new screens`, чтобы новый видимый текст переводился автоматически. При первом выборе онлайн-сервиса нажмите `Allow auto-translate`, чтобы разрешить отправку видимого текста, или `Manual only`, чтобы перевод запускался только вручную.

Если автоматический перевод отключён, используйте `Translate` или `Ctrl+Shift+T`. Мод переводит видимый текст и обрабатывает новые блоки, появляющиеся при прокрутке.

### Кэш и контакты

Переводы кэшируются автоматически. В настройках показываются количество сохранённых переводов и их размер. Кнопок ручного управления кэшем в панели нет.

Внизу панели рядом с VN Revival находятся иконки:

- [Discord](https://discord.gg/QgyeWW3Jg)
- [Telegram](https://t.me/VnRevival)
- [Почта](mailto:master1c8@proton.me)

### Закрытие и решение проблем

Закройте CoC2 обычным способом. Переводчик и его локальный помощник должны автоматически завершиться через несколько секунд.

Если после пересборки показывается старая панель, полностью закройте CoC2, распакуйте новый ZIP в отдельную папку и запустите переводчик из неё. Пересборка не обновляет панель, уже внедрённую в работающую игру.

Если панель не появилась, убедитесь, что CoC2 была закрыта перед запуском и что игра запущена через CoC2 Translator.
