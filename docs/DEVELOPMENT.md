# Development map

Use the smallest relevant context first. Expand to architecture and full tests
only when a change crosses a boundary.

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
./scripts/test-service.sh
./scripts/test-adapter.sh
./scripts/test-browser-smoke.sh
./scripts/test-coc2.sh --quiet
./scripts/test-coc2.sh
```

Focused commands are iteration checks, not the final integration gate. The
quiet full suite prints compact progress on success and retains normal command
failures. Re-run the verbose suite when a failure needs diagnosis.

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
