#!/usr/bin/env python3
"""Build the existing translator locally and retain unsigned provenance."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import zipfile


def sha(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), *args], text=True).strip()


def inventory(root):
    result = {}
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ValueError("Symlink material: " + str(path))
        if path.is_file():
            result[path.relative_to(root).as_posix()] = {
                "sha256": sha(path), "sizeBytes": path.stat().st_size}
    if not result:
        raise ValueError("Empty stage")
    return result


def verify(archive, stage, manifest):
    expected = {stage.name + "/" + name: row for name, row in inventory(stage).items()}
    expected[manifest.name] = {"sha256": sha(manifest), "sizeBytes": manifest.stat().st_size}
    with zipfile.ZipFile(archive) as package:
        files = [row for row in package.infolist() if not row.is_dir()]
        if len(files) != len(expected) or {row.filename for row in files} != set(expected):
            raise ValueError("Unexpected or duplicate archive files")
        for row in files:
            h = hashlib.sha256()
            with package.open(row) as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    h.update(block)
            if (row.file_size != expected[row.filename]["sizeBytes"]
                    or h.hexdigest() != expected[row.filename]["sha256"]):
                raise ValueError("Archive bytes differ: " + row.filename)
    return len(files)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--game", required=True, choices=["coc2", "tits"])
    parser.add_argument("--release", required=True, type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    out = args.release.resolve()
    if not out.is_relative_to(root / "releases") or out.exists():
        raise ValueError("Use a new directory under canonical releases")
    if git(root, "branch", "--show-current") != "main" or git(root, "status", "--porcelain"):
        raise ValueError("Commit source on clean canonical main first")
    commit = git(root, "rev-parse", "HEAD")
    if git(root, "rev-parse", "origin/main") != commit:
        raise ValueError("Push source before building")
    repository = git(root, "remote", "get-url", "origin").removesuffix(".git")
    expected_repo = {"coc2": "coc2-translation-mod", "tits": "Tits"}[args.game]
    if repository != "https://github.com/Master1C8/" + expected_repo:
        raise ValueError("Unexpected canonical repository")
    game = json.loads((root / "src/games" / args.game / "game.json").read_text())
    version = (root / "VERSION").read_text().strip()
    python_zip = root / ".build/cache/python-3.11.9-embed-amd64.zip"
    if not python_zip.is_file():
        raise ValueError("Prepare the official Python 3.11.9 embeddable ZIP first")
    python_hash = sha(python_zip)
    tools = {}
    for name in ["python3", "node", "zsh", "xcrun", "swiftc", "clang", "lipo",
                 "codesign", "ditto", "zip", "x86_64-w64-mingw32-gcc",
                 "x86_64-w64-mingw32-windres"]:
        path = os.environ.get("VNREVIVAL_SWIFTC") if name == "swiftc" else shutil.which(name)
        path = path or shutil.which(name)
        if not path:
            raise ValueError("Missing build tool: " + name)
        tools[name] = {"path": str(Path(path).resolve()), "sha256": sha(path)}
    tools["swiftVersion"] = subprocess.check_output([tools["swiftc"]["path"], "--version"], text=True).strip()
    sdk = Path(os.environ.get("SDKROOT") or subprocess.check_output(["xcrun", "--show-sdk-path"], text=True).strip()).resolve()
    tools["sdk"] = {"path": str(sdk), "settingsSha256": sha(sdk / "SDKSettings.json")}
    compiler_root = Path(tools["swiftc"]["path"]).parent.parent
    tools["swiftFrontendSha256"] = sha(compiler_root / "bin/swift-frontend")
    tools["swiftCompatibilityLibraries"] = {p.name: sha(p) for p in sorted((compiler_root / "lib/swift/macosx").glob("libswiftCompatibility*.a"))}
    receipt = os.environ.get("VNREVIVAL_TOOLCHAIN_RECEIPT")
    if receipt:
        tools["toolchainDistribution"] = json.loads(Path(receipt).read_text())
    tools["sdkVersion"] = json.loads((sdk / "SDKSettings.json").read_text())["Version"]
    tools["pillowVersion"] = subprocess.check_output(
        [str(root / ".venv/bin/python"), "-c", "import PIL; print(PIL.__version__)"], text=True).strip()
    started = datetime.now(timezone.utc).isoformat()
    out.mkdir(parents=True)
    log_path = out.parent / (out.name + ".build.log")
    env = {**os.environ, "VNREVIVAL_RELEASE_DIR": str(out),
           "VNREVIVAL_MAC_SIGN_IDENTITY": "-", "VNREVIVAL_MAC_NOTARY_PROFILE": "",
           "VNREVIVAL_WINDOWS_SIGN_CERT": "", "VNREVIVAL_APP_ONLY": "0",
           "VNREVIVAL_WINDOWS_UNPACKED_ONLY": "0", "VNREVIVAL_TEST_QUIET": "1"}
    with log_path.open("x") as log:
        subprocess.run(["zsh", "scripts/build-" + args.game + ".sh"], cwd=root, env=env,
                       stdout=log, stderr=subprocess.STDOUT, check=True)
    log_path.rename(out / "build.log")
    if git(root, "rev-parse", "HEAD") != commit or git(root, "status", "--porcelain"):
        raise ValueError("Source changed during build")
    if sha(python_zip) != python_hash:
        raise ValueError("Python input changed during build")
    records = []
    for platform, label, stage in [
        ("windows", "Windows", root / ".build/windows" / game["windowsDistributionName"]),
        ("macos", "macOS", root / ".build/macos" / (game["translatorName"] + ".app")),
    ]:
        archive = out / (game["archivePrefix"] + "-" + label + "-" + version + ".zip")
        manifest = out / "vnrevival-release.json"
        manifest.write_text(json.dumps({
            "schemaVersion": 1, "gameSlug": game["siteSlug"], "platform": platform,
            "version": version, "sourceCommit": commit, "sourceTreeClean": True,
            "repositoryUrl": repository, "recipe": "scripts/build-provenance.py",
        }, indent=2) + "\n")
        with zipfile.ZipFile(archive, "a", compression=zipfile.ZIP_DEFLATED) as package:
            package.write(manifest, manifest.name)
        count = verify(archive, stage, manifest)
        manifest.rename(out / (platform + "-vnrevival-release.json"))
        if archive.stat().st_size > 100_000_000:
            raise ValueError("Archive exceeds 100 MB")
        records.append({"platform": platform, "filename": archive.name, "sha256": sha(archive),
                        "sizeBytes": archive.stat().st_size, "verifiedEntries": count})
    (out / "source-tree.txt").write_text(git(root, "ls-tree", "-r", "--full-tree", commit) + "\n")
    (out / "SHA256SUMS").write_text("".join(r["sha256"] + "  " + r["filename"] + "\n" for r in records))
    # Publish the completion record only after both archives have been verified.
    (out / "provenance.json").write_text(json.dumps({
        "schemaVersion": 1, "source": {"repository": repository, "commit": commit,
        "tree": git(root, "rev-parse", "HEAD^{tree}")}, "version": version,
        "build": {"method": "local macOS compilation and Windows cross-compilation",
        "recipe": "scripts/build-provenance.py", "startedAt": started,
        "completedAt": datetime.now(timezone.utc).isoformat(), "tools": tools,
        "logSha256": sha(out / "build.log")},
        "materials": [{"filename": python_zip.name, "sha256": python_hash,
        "sourceUrl": "https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip"}],
        "artifacts": records, "assurance": {"statement": "unsigned local build record",
        "publisherSignature": None, "notarization": None, "livePaidRequests": False,
        "runtimeBoundary": "Existing isolated tests and package verification; no new real-game run"}},
        indent=2) + "\n")
    print(json.dumps({"sourceCommit": commit, "artifacts": records}))


if __name__ == "__main__":
    main()
