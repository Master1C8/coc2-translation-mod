# CoC2 Translator

Независимый runtime-переводчик для Steam-версии **Corruption of Champions
II** на Windows и macOS. Он переводит видимый и динамически появляющийся текст
запущенной Electron-игры и не извлекает, не изменяет и не распространяет её
ресурсы.

Поддерживаются Google Translate и OpenAI-compatible Chat Completions через
OpenCode Go, OpenCode Zen, OpenRouter, DeepSeek, LM Studio или пользовательский
HTTPS/loopback endpoint. API-ключи хранятся в macOS Keychain или Windows
Credential Manager, отдельно для каждого Base URL.

## Документация

- [Руководство пользователя](docs/USER_GUIDE.md) — запуск, управление,
  провайдеры, кэш и решение проблем на английском и русском.
- [Архитектура](docs/ARCHITECTURE.md) — runtime, безопасность, кэш и launcher
  invariants.
- [Разработка](docs/DEVELOPMENT.md) — карта файлов и focused test commands.
- [Контракт адаптера](docs/ADAPTER_CONTRACT.md) — добавление и проверка игровых
  manifest/DOM rules.
- [Последняя QA-проверка](docs/QA_REPORT.md) — release verification record.

## Быстрая проверка

```bash
./scripts/test-coc2.sh --quiet
```

Для диагностики используйте verbose-вариант без `--quiet`. Сборка текущей игры:

```bash
./scripts/build-coc2.sh
```

Сборка создаёт macOS и Windows архивы в `launcher/READY_TO_SHARE/`. Она не
публикует релиз и не выполняет deployment.

Чтобы из терминала найти самую новую установленную версию CoC2 во всех
бутылках CrossOver и запустить её вместе с переводчиком:

```bash
./scripts/launch-latest-coc2-crossover.sh
```

Команда с `--print` только покажет выбранную бутылку, версию и путь, не запуская
игру.

## Платформы

- Windows launcher — нативное Win32 x86-64 GUI-приложение без консоли и прав
  администратора; пакет содержит официальный embeddable Python.
- macOS 12+ — universal app (`arm64` + `x86_64`), использующий CrossOver при его
  наличии, иначе Parallels Desktop с комплектным Windows launcher.
- Electron CDP и credential helper слушают только loopback соответствующей ОС
  или виртуальной машины.

Проект VN Revival: [vnrevival.fun](https://vnrevival.fun/).
