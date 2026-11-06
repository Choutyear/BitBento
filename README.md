<p align="center">
  <img src="frontend/bitbento-logo.png" width="112" alt="BitBento logo">
</p>

<h1 align="center">BitBento</h1>

<p align="center">
  <strong>Neatly packed. Locally processed.</strong><br>
  A private, offline video compressor built for Windows 11.
</p>

<p align="center">
  <a href="https://choutyear.github.io/BitBento/"><img src="docs/images/button-website-en.svg" alt="Official Website" height="40"></a>
  &nbsp;
  <a href="https://github.com/Choutyear/BitBento/releases/latest/download/BitBento-Setup.exe"><img src="docs/images/button-download-en.svg" alt="Download App" height="40"></a>
</p>

<p align="center">
  English · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%2011%20x64-0078D4">
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2-24C8DB">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-49CF91">
  <img alt="Privacy" src="https://img.shields.io/badge/processing-100%25%20offline-7B61FF">
</p>

BitBento is a free and open-source desktop video compressor built with Tauri 2, Rust, FFmpeg, and ffprobe. It processes every video locally: there are no uploads, accounts, advertisements, subscriptions, or telemetry.

<p align="center">
  <img src="docs/images/bitbento-overview.png" width="100%" alt="BitBento desktop app in Simplified Chinese, showing its media list, video details, target-size controls, and output queue">
</p>

<p align="center"><sub>The real BitBento desktop app on Windows 11 — Simplified Chinese is the default UI language.</sub></p>

<p align="center">
  <a href="https://github.com/Choutyear/BitBento/releases/latest"><strong>Download for Windows</strong></a>
  &nbsp;·&nbsp;
  <a href="#build-from-source">Build from source</a>
  &nbsp;·&nbsp;
  <a href="README.zh-CN.md">阅读中文说明</a>
</p>

## Download

Download the latest build from [GitHub Releases](https://github.com/Choutyear/BitBento/releases/latest).

| Package | Use case |
| --- | --- |
| [BitBento-Setup.exe](https://github.com/Choutyear/BitBento/releases/latest/download/BitBento-Setup.exe) | Recommended. Installs BitBento for the current Windows user. The installer supports English and Simplified Chinese. |
| [BitBento-Portable.zip](https://github.com/Choutyear/BitBento/releases/latest/download/BitBento-Portable.zip) | Extract the entire folder and run `BitBento.exe`. No installation is required. |

BitBento currently ships as an unsigned build. Windows SmartScreen may show an “Unknown publisher” warning. Verify the SHA-256 checksums in the release before running a downloaded file.

## Features

| Pick a size, not a bitrate | Keep the whole batch moving | Stay offline by design |
| --- | --- | --- |
| Enter the file size you need. BitBento calculates the bitrate, preserves source resolution and frame rate, and can strictly verify the final byte size. | Queue multiple videos with real progress, elapsed time, ETA, safe cancellation, collision-free filenames, and clear per-job errors. | Inspection, preview generation, and encoding all happen on your PC. No uploads, accounts, telemetry, cloud SDKs, or ads. |

| For everyday compression | For precise control |
| --- | --- |
| **Target size mode** keeps the workflow deliberately simple: choose the desired MB value and let BitBento handle the encoding parameters. | **Professional mode** gives you control over container, codec, bitrate, resolution, frame rate, and audio. |

### Built for real media

- **Accurate inspection** with bundled ffprobe for MP4, MOV, MKV, WebM, variable-frame-rate video, rotation metadata, Unicode filenames, and long Windows paths.
- **Verified hardware acceleration** for NVIDIA NVENC, Intel Quick Sync, and AMD AMF. An encoder is offered only after it successfully initializes; CPU encoding remains available as a fallback.
- **Local playback** for supported videos, with a temporary offline compatibility preview when needed.
- **Bilingual from setup to export** with English and Simplified Chinese in both the app and NSIS installer.

## From video to Bento in three steps

1. **Add your videos** — select one or many files, or drag them into the media list. BitBento reads their real metadata locally.
2. **Choose the result** — set a target size for a quick workflow, or switch to professional controls when every parameter matters.
3. **Start the queue** — watch real FFmpeg progress, cancel safely when needed, then open the completed file or its folder.

## How it works

BitBento uses a Tauri WebView for the interface and a Rust backend for all privileged work. The frontend cannot execute arbitrary shell commands. Rust invokes the verified local FFmpeg and ffprobe sidecars with structured arguments, emits typed job events, writes to temporary partial files, and only finalizes a successful output.

In strict target-size mode, BitBento reserves container and audio overhead, encodes locally, verifies the final byte size, and adjusts the bitrate when another pass is needed. Hardware acceleration can remain enabled during this process when the selected encoder has passed initialization.

## System requirements

- Windows 11 x64
- Microsoft Edge WebView2 Runtime (normally included with Windows 11)
- A supported GPU and current driver for optional hardware encoding

BitBento bundles its own FFmpeg and ffprobe binaries. Users do not need to install FFmpeg, Node.js, or Rust.

## Build from source

### Prerequisites

- Windows 11 x64
- Microsoft C++ Build Tools with the **Desktop development with C++** workload
- Rust stable with the MSVC toolchain
- Node.js LTS and npm
- Microsoft Edge WebView2 Runtime
- The verified Gyan FFmpeg 7.0.2 Essentials Windows x64 archive

### Prepare and build

```powershell
git clone https://github.com/Choutyear/BitBento.git
cd BitBento
npm ci

powershell -ExecutionPolicy Bypass -File .\scripts\prepare-ffmpeg.ps1 `
  -ArchivePath C:\Downloads\ffmpeg-7.0.2-essentials_build.zip `
  -ExpectedSha256 d5308d30872b2739cf53169df61faba8639d39a19b20b91e611c177ef676f64c

npm run build
powershell -ExecutionPolicy Bypass -File .\scripts\collect-release.ps1
```

The final installer and portable folder are written to `release/`. FFmpeg executables are deliberately excluded from Git; the preparation script verifies the archive checksum before installing the sidecars.

## Development and tests

```powershell
npm run dev
cargo fmt --manifest-path .\src-tauri\Cargo.toml --all -- --check
cargo clippy --manifest-path .\src-tauri\Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path .\src-tauri\Cargo.toml --all-targets
cargo test --manifest-path .\src-tauri\Cargo.toml --all-targets -- --ignored --test-threads=1
```

The ignored Rust tests require prepared FFmpeg sidecars and exercise real probing, strict target-size encoding, professional encoding, cancellation, and cleanup. The release checklist and the latest Windows test report are available in [`docs/ACCEPTANCE_CHECKLIST.md`](docs/ACCEPTANCE_CHECKLIST.md) and [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md).

## Project structure

```text
frontend/            Approved UI, localization, and queue interaction
src-tauri/src/       Rust commands, probing, encoding, queue, and hardware detection
src-tauri/binaries/  Sidecar placeholders and distributable license files
scripts/             Sidecar preparation, release packaging, and WebView tests
docs/                Product specification, architecture, and acceptance records
```

## Privacy

All media analysis, preview generation, and encoding happen on the local computer. BitBento does not upload filenames, metadata, videos, diagnostics, or usage data. Technical logs are stored locally to help diagnose failures.

## Free software statement

BitBento is provided free of charge. No purchase, subscription, or payment is required. If a third-party distributor requests a software license fee, verify the source and prefer the official [GitHub repository](https://github.com/Choutyear/BitBento). BitBento is developed and maintained by Steve Chou.

## License and third-party software

BitBento-owned source code is released under the [MIT License](LICENSE). The bundled FFmpeg build is distributed under GPL-3.0-or-later, and other dependencies retain their respective upstream licenses. See [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt) and the files under `src-tauri/binaries/licenses/` for provenance and license texts.

Contributions and bug reports are welcome through GitHub Issues and pull requests.
