# Source-only archival

Canonical source, game-specific manifest/adapter, editable app icons/assets,
licenses, source tests and locked development dependency metadata are retained.
No game copy, static translation pack, provider key or player save is required to
edit and rebuild this realtime translator. Runtime/user data are outside cleanup.

## Restore and normal build

Follow [the verified toolchain recipe](docs/BUILD_TOOLCHAIN.md) and
`build-toolchain.json`: official Swift6.3.2 + macOS26.5 SDK, Python3.14.6/uv.lock,
Node22.x and MinGW-w64. Both platform builds passed from fresh generated/dependency
directories on2026-11-03; the former Intel link blocker was resolved without changing
app code, minimum OS support or runtime compatibility flags. Both universal slices
declare macOS12.0; strict ad hoc signing, Windows PE, ZIP/hash/content checks and
existing full source/browser test suites passed. No new game/provider/runtime or
visual acceptance is claimed.

Current accepted installers and compact publication evidence remain in
`release-0.11.3-4d91998d8172` in `Master1C8/coc2-translation-mod`. Authenticated cold download and complete
archive checks passed against existing published hashes. No new verification
build was uploaded or published. Git clone restores all editable icons and code;
only standard development tools/runtime distributions are downloaded separately.

After verified restoration/build, installed environments, old and fresh .build
caches, previous/current local distribution copies and temporary review intermediates
are retired. Keep the canonical source checkout and normal Git history. Repository
visibility/history remain unchanged and it stays writable for future fixes.
