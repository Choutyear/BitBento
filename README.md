# BitBento

Neatly packed, locally processed.

This is the approved UI and engineering handoff package for building BitBento as a Windows 11 `.exe` application with Tauri 2 and FFmpeg.

## What is included

- Approved single-page interface: `frontend/index.html`
- Tauri 2 project skeleton: `src-tauri/`
- Product and encoding requirements: `docs/`
- Codex execution contract: `AGENTS.md`
- FFmpeg sidecar preparation template: `scripts/prepare-ffmpeg.ps1`
- Release collection script: `scripts/collect-release.ps1`

FFmpeg binaries are intentionally not included. They must be downloaded from a trusted current Windows build, hash-verified, and placed using the preparation script. This avoids shipping an unverified or stale executable.

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
