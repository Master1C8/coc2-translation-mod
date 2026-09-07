# Development map

Use the smallest relevant context first. Expand to architecture and full tests
only when a change crosses a boundary.
Search symbols with `rg -n`, then read bounded ranges around the matches and
their callers. Reuse earlier reads; read a fresh diff after edits. Do not load
generated `.build/` bundles or all documentation for ordinary source changes.

| Task | Read first | Focused verification |
|---|---|---|
| Translation primitives, markers, splitting | `src/translation-core.js`, `tests/translation-core.test.js` | `./scripts/test-runtime.sh` |
| Provider registry | `src/providers.js`, `tests/providers.test.js` | `./scripts/test-runtime.sh` |
| Panel markup or styling | `src/panel-view.js`, `src/interface-presets.js`, relevant smoke assertions | `./scripts/test-runtime.sh` |
| Runtime behavior | relevant runtime section and matching file under `tests/runtime/` | `./scripts/test-runtime.sh` |
| Credential helper or OpenAI-compatible HTTP | relevant section of `src/local_service.py`, `tests/test_local_service.py` | `./scripts/test-service.sh` |
| CoC2 selectors or identity | `src/games/coc2/adapter.js`, `src/games/coc2/game.json` | `./scripts/test-adapter.sh` |
| macOS launcher or CDP controller | `launcher/macos/launch.sh`, `src/controller/main.swift` | full test suite |
| Windows launcher or packaging | `launcher/windows/launcher.c`, `scripts/build-windows.sh` | full test suite |
| Release packaging | `scripts/build.sh`, `scripts/build-windows.sh`, `scripts/verify.sh` | full test suite and requested build |

## Commands

```text
./scripts/test-runtime.sh
./scripts/test-runtime.sh --unit-only --quiet
./scripts/test-service.sh
./scripts/test-adapter.sh --quiet
./scripts/test-browser-smoke.sh
./scripts/test-coc2.sh --quiet
./scripts/test-coc2.sh
```

Focused commands are iteration checks, not the final integration gate. The
quiet full suite prints compact progress on success and retains normal command
failures. Re-run the verbose suite when a failure needs diagnosis.
Runtime and adapter checks accept `--quiet`; runtime `--unit-only` skips the
browser for isolated core/provider iterations. DOM, panel and runtime changes
still need browser smoke; every integration still needs the full suite.

## Symbol routes

Locate these anchors, read their surrounding functions and matching assertions,
then expand to shared setup and callers as needed. Anchors avoid stale line numbers.

| Area | Source anchors | Test anchors |
|---|---|---|
| Batching, scoped glossary, screen timing | core `batchScreenJobs`, `jobTextParts`, `selectGlossary`; runtime `applyBatchTranslation`, `runJobs`; helper `screen_metrics` | `tests/runtime/optimization-scenario.js`, `tests/runtime/screen-block-scenario.js`, `tests/test_service_logging.py` |
| Cache | runtime `emptyCacheMetadata`, `openDb` through `clearAllCache` | smoke scenario `repairedMetadata`, `legacyMigrated`, `cacheDeleted` |
| Logs and translation capture | runtime `refreshCacheStats`, `copyLocalLog`, `appendTranslationCapture`; helper `log_event` through `read_capture`, `openai_translate`, `do_GET`, `do_POST` | `tests/test_service_logging.py`; helper tests `test_log_status_read_and_clear`, `test_translation_capture_is_explicit_separate_and_replaceable`; smoke `compactCacheRow` through `translationCaptureWorks` |
| Provider settings/models | runtime `openAICompatibleConnection`, `providerCacheVariant`, `populateOpenAICompatibleModelOptions`, `refreshOpenAICompatibleStatus`; helper `_connection`, `_models`, `openai_status` | helper `test_status_`, `test_opencode_`; smoke `safeOpenAIModelPicker`, `modelListRefreshesOnOpen` |
| Request errors/parameters | runtime `requestChunk`, `applyOpenAICompatibleModelParameters`; helper `_unsupported_model_parameter`, `_classified_provider_error`, `_model_parameters`, `openai_translate` | helper `test_translation_`; smoke `openAIModelParametersSaved` |
| DOM/formatting | runtime `classifyNode`, `registerTranslationContainers`, `applyLanguageFormatting`, `buildJobs`, `runJobs` | smoke `translated`, `restored`, `hiddenTooltipPrefetched` |
| Panel text/layout | game manifest `theme`; panel CSS selector/markup; presets key; runtime `applyInterfacePreset` and control binding | smoke matching control name; User Guide `Controls` and `Управление` |

Here runtime means `src/translator-runtime.js`, helper means
`src/local_service.py`, and helper tests means `tests/test_local_service.py`.
Smoke assertions live in `tests/runtime/smoke-scenario.js`; mocks are in
`smoke-setup.js`. `smoke-report.js` reports failed check names or a safe exception
type through the page title, which the runner prints. It deliberately omits
settings, request bodies and exception messages. Inspect only the named group
first; a timeout may require the fixture load order and setup.

## Boundaries

- Browser code is concatenated into one synchronous `translator.bundle.js`.
- `tests/runtime-smoke.html` is only the fixture shell; setup and assertions are
  split under `tests/runtime/` so a task can load its relevant section.
- `src/local_service.py` is copied into both macOS and Windows distributions
  and must remain standard-library-only.
- `src/languages.json` is the canonical translator language catalog;
  `.build/languages.js` is generated from it for tests and bundles.
- `src/openai-compatible.json` is the shared browser/helper source for prompts,
  presets, limits, and documented OpenCode Chat Completions models.
- The browser runtime public surface is `window.__vnRevivalTranslator`.
  Unexported helper functions are not a compatibility API.
- `docs/USER_GUIDE.md` is the canonical detailed user documentation.
  `README.md` is intentionally only an entry point.
