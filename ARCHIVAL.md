# Source-only archival — pending toolchain verification

The published project is complete, but the 2026-11-03 archive gate is blocked. Fresh locked dependency installation, source/unit fixtures, isolated headless browser smoke and Windows packaging passed. The normal universal macOS build failed when linking the Intel controller: the installed Command Line Tools `libswiftCompatibility56.a` and `libswiftCompatibilityPacks.a` contain arm64/arm64e only; `__swift_FORCE_LOAD_$_swiftCompatibility56` is undefined for x86_64.

No original working/build data was deleted. The original `.build/` and environment were preserved and returned to their original paths; only this audit's fresh failed-check outputs were removed. No macOS deployment target, platform support, runtime code or accepted public release was changed.

To resume, use a verified compatible Swift toolchain with those Intel compatibility libraries (the builder accepts `VNREVIVAL_SWIFTC` and `SDKROOT`), then run the existing game-specific normal build from a fresh scratch tree. Keep existing unique inputs until both platforms pass. The repository's `uv.lock`, source, current published installers and publication evidence remain the recovery set. No game/provider invocation or publication was performed by this audit.

A task-local official notarized Swift 6.2.3 distribution was also checked without
installing globally. Its Intel compatibility libraries were present, but its
frontend did not finish importing the newer macOS 27 SDK (the required controller
probe spent over 17 minutes in module/overlay import; the diagnostic probe over
44 minutes). Task-owned probes were stopped after stack sampling. This is not a
successful rebuild. A matching compiler/SDK pair is still required; no runtime
compatibility flag or minimum OS version was changed. The downloaded temporary
compiler is excluded from the recovery set and GitHub.
