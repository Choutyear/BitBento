# BitBento implementation contract

You are completing a real Windows 11 desktop video compressor, not a UI mock.

Read these files before editing:

1. `README.md`
2. `docs/PRODUCT_SPEC.md`
3. `docs/ARCHITECTURE.md`
4. `docs/ACCEPTANCE_CHECKLIST.md`

## Non-negotiable requirements

- Preserve the approved BitBento visual design in `frontend/index.html`.
- Replace all hard-coded demo files, fake queue items, simulated progress, alerts, and timeouts with real state.
- Use Tauri 2 and Rust for privileged operations. Do not expose arbitrary shell execution to the frontend.
- Bundle verified `ffmpeg.exe` and `ffprobe.exe` as Tauri sidecars. Never concatenate paths or user input into a shell command.
- All video processing must remain local. Do not add telemetry, accounts, cloud uploads, advertising, or another brand.
- Support Windows 11 x64 first. UI language must default to Simplified Chinese while retaining the existing English subtitle.
- Implement target-size and professional modes exactly as specified.
- Implement batch queue, progress, cancellation, output naming, collision handling, output directory selection, hardware detection, and error reporting.
- Do not claim completion until the acceptance checklist passes with real media files.
- Produce both an NSIS installer and a portable release folder.

## Working rules

- Prefer small modules over a monolithic `main.rs` or a single giant script.
- Keep frontend/backend types aligned and serializable.
- Emit structured Tauri events for job progress and state changes.
- Preserve user files on failure or cancellation; write to a temporary partial file and atomically finalize successful output.
- Log technical details locally, but show concise Chinese messages in the UI.
- Include all third-party licenses in the release.

## Definition of done

Completion means a clean Windows 11 machine can install or run BitBento Portable, select real videos, inspect metadata, configure jobs, compress them with FFmpeg, cancel safely, and open the output folder. A wrapped HTML mock is not completion.
