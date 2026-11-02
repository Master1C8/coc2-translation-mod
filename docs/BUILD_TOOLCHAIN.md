# Verified source-only rebuild toolchain

The verified pair is official Swift **6.3.2** and the **macOS 26.5 SDK**. Both
arm64 and x86_64 controller slices retain their macOS **12.0** target. The installed
Swift 6.4 CLT compatibility archives lacked Intel slices; Swift 6.2.3 could not
import SDK27. Do not silently substitute a different SDK, raise the deployment
target or disable compatibility linking to bypass that failure.

Distribution URL, SHA-256, byte length, publisher, compiler/frontend/library hashes
and SDKSettings identity are pinned in `../build-toolchain.json`. The official PKG
was Apple-notarized and signed by Swift Open Source (V9AUD2URP3). Extraction below
runs no package installer scripts and changes no system/global compiler settings.

From the canonical checkout, first install the usual macOS CLT/Xcode build tools,
Node 22.x, uv, MinGW-w64 and a matching macOS26.5 SDK. The audited SDK path was
`/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk`; an SDK in Xcode26.5 is
also a candidate only after verifying its pinned settings. Apple SDKs/toolchains
are development prerequisites, not game inputs or GitHub payload dumps.

Use a new tool directory. If it already exists, verify it against the manifest
rather than overwriting an unknown copy:

```sh
mkdir -p .build
mkdir .build/swift-6.3.2
curl --fail --location --output .build/swift-6.3.2/toolchain.pkg \
  https://download.swift.org/swift-6.3.2-release/xcode/swift-6.3.2-RELEASE/swift-6.3.2-RELEASE-osx.pkg
python3 -B - <<'PY_CHECK'
import hashlib, json
from pathlib import Path
pin = json.loads(Path('build-toolchain.json').read_text())
f = Path('.build/swift-6.3.2/toolchain.pkg')
h = hashlib.sha256()
with f.open('rb') as stream:
    for block in iter(lambda: stream.read(1048576), b''):
        h.update(block)
assert f.stat().st_size == pin['archiveBytes']
assert h.hexdigest() == pin['archiveSha256']
sdk = Path('/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk')
assert hashlib.sha256((sdk/'SDKSettings.json').read_bytes()).hexdigest() == pin['sdkSettingsSha256']
PY_CHECK
pkgutil --check-signature .build/swift-6.3.2/toolchain.pkg
pkgutil --expand-full .build/swift-6.3.2/toolchain.pkg .build/swift-6.3.2/expanded
export VNREVIVAL_SWIFTC="$PWD/.build/swift-6.3.2/expanded/swift-6.3.2-RELEASE-osx-package.pkg/Payload/usr/bin/swiftc"
export SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk
uv sync --locked --python 3.14.6
export PATH="$PWD/.venv/bin:$PATH"
VNREVIVAL_RELEASE_DIR="$PWD/releases/NEW_REVISION" zsh scripts/build-coc2.sh
```

The normal recipe runs the complete source fixtures/browser smoke, cross-builds
Windows with official Python3.11.9 embeddable and compiles/signs/verifies both Mac
architectures. It uses no old project cache, game installation, model request or
provider credential. The official Python ZIP SHA-256 verified in this audit is
`009d6bf7e3b2ddca3d784fa09f90fe54336d5b60f0e0f305c37f400bf83cfd3b`. The audited Python was3.14.6, Pillow12.3.0, pip26.2.1 and Node22.23.3.
The embedded Windows Python runtime is downloaded from the pinned version's official
python.org URL by the existing builder.

`SDKROOT` and `VNREVIVAL_SWIFTC` must be exported together for the normal build or
`scripts/build-provenance.py`. The latter records actual compiler/SDK hashes. Do
not point DEVELOPER_DIR at a nonexistent Xcode.app; use the active installed CLT.

Fresh full normal builds passed on2026-11-03 with strict ad hoc signature, universal
architecture, ZIP/hash and Windows PE checks. The linker reports that three Swift
SDK stub libraries are stamped macOS13 while targeting12; both final Mach-O slices
still declare12.0. No fresh macOS12 runtime/game acceptance was performed or claimed,
and these verification outputs were not published. Existing accepted releases stay
unchanged. Retire .build/, .venv/ and verification release directories again after
checking; retain source, licenses, uv.lock and this recovery recipe.
