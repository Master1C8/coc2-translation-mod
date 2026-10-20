# Published release verification

Windows and universal macOS packages were published on October 20, 2026.
Download the platform ZIP, evidence ZIP and `PUBLICATION-SHA256SUMS` from
[the published release](https://github.com/Master1C8/coc2-translation-mod/releases/tag/release-0.11.3-4d91998d8172).

Compare each downloaded ZIP against its checksum line using `shasum -a 256`
on macOS or `Get-FileHash <file> -Algorithm SHA256` on Windows. If all ZIPs
are downloaded, `shasum -a 256 -c PUBLICATION-SHA256SUMS` verifies the full set.

```text
f35ab2996dbf3610cda6a97766238eb7d21be93794670e0ef8092ffaa88777a7  CoC2-Translator-Windows-0.11.3.zip
54a807907057b0af4a5f12cc8b7bf972519d2c8c90dd71b1e242a13f0eef3653  CoC2-Translator-macOS-0.11.3.zip
cab3a0de84acd32f37223f04b806ce728e7a09cec313fcadda71771344259e9f  CoC2-0.11.3-4d91998d8172-evidence.zip
```

Actual build source: [`4d91998d8172db2bd7818d64f6c5aff32f63cc8e`](https://github.com/Master1C8/coc2-translation-mod/commit/4d91998d8172db2bd7818d64f6c5aff32f63cc8e).
Match it with the tag, `provenance.json` and each installer ZIP's root
`vnrevival-release.json`; do not substitute the latest repository HEAD.
The source listing, build log and material hashes identify the compilation
and recorded test boundaries.

Locally built Windows x86-64 and universal Apple Silicon / Intel macOS packages.
Actual source commit: `4d91998d8172db2bd7818d64f6c5aff32f63cc8e`.

Download the desired platform ZIP, `CoC2-0.11.3-4d91998d8172-evidence.zip` and `PUBLICATION-SHA256SUMS`.
Compare SHA-256 with the checksum file, then inspect the evidence ZIP.
`provenance.json`, the platform `*-vnrevival-release.json`, the installer archive's
root `vnrevival-release.json` and this release tag identify the same source commit.
`source-tree.txt` and `build.log` record compilation, full isolated test results and
package verification. The recorded tools include the selected official Swift
compiler distribution, frontend, compatibility libraries and SDK.

The unchanged Python runtime input is identified by official download URL and hash.
Both ZIPs were compared file by file with their final stages. Tests cover the local
translator and mocked provider/browser interactions; no new real-game run or paid
translation request is claimed. The macOS deployment target remains 12.0; no runtime
check on macOS 12 was performed and SDK linker diagnostics remain in the build log.
macOS is ad hoc signed, without notarization. This is an unsigned local build record,
not a GitHub build attestation or independent security review.

Historical build records retain their original dates and statuses. Earlier
archives without a retained build record keep unknown exact source provenance.
