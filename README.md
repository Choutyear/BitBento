# BitBento

Neatly packed, locally processed.

BitBento is a free, open-source, fully offline video compressor for Windows 11 x64, built with Tauri 2, Rust, FFmpeg, and ffprobe.

Project homepage: https://github.com/Choutyear/BitBento

BitBento-owned source code is released under the [MIT License](LICENSE). Bundled third-party components retain their respective licenses; see [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt).

## What is included

- Approved single-page interface: `frontend/index.html`
- Tauri 2 + Rust desktop application: `src-tauri/`
- Product and encoding requirements: `docs/`
- Codex execution contract: `AGENTS.md`
- Verified FFmpeg sidecar preparation and provenance script: `scripts/prepare-ffmpeg.ps1`
- Release collection script: `scripts/collect-release.ps1`

Release builds bundle hash-verified local FFmpeg and ffprobe sidecars. Video files never leave the computer, and BitBento contains no telemetry, account, advertising, or cloud-upload SDK.

## Recommended build environment

- Windows 11 x64
- Microsoft C++ Build Tools with the Desktop development with C++ workload
- Microsoft Edge WebView2 Runtime
- Rust stable (MSVC toolchain)
- Node.js LTS and npm
- Two verified Windows x64 binaries: `ffmpeg.exe` and `ffprobe.exe`

## First run for Codex

1. Read `AGENTS.md` and every file in `docs/`.
2. Run `npm install`.
3. Prepare sidecars:

   ```powershell
   .\scripts\prepare-ffmpeg.ps1 -ArchivePath C:\Downloads\ffmpeg.zip -ExpectedSha256 "<SHA256>"
   ```

4. Implement the backend and replace prototype-only frontend behavior.
5. Run `npm run tauri dev` during development.
6. Run `npm run tauri build -- --bundles nsis` for the installer.
7. Run `powershell -ExecutionPolicy Bypass -File .\scripts\collect-release.ps1` to assemble deliverables.

## Expected final deliverables

- `release/BitBento-Setup.exe`
- `release/BitBento-Portable/BitBento.exe`
- Bundled sidecars and required runtime files in the portable folder
- `release/THIRD_PARTY_LICENSES.txt`
- A short `release/README.txt`

The raw Tauri release executable may run portably, but Codex must test the collected portable folder on a clean Windows 11 account before shipping it.
