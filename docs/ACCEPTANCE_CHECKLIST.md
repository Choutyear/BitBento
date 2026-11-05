# Acceptance checklist

Codex must execute and record these checks on Windows 11 x64.

## Build and launch

- [ ] `npm install` succeeds from a clean checkout.
- [ ] `npm run tauri dev` launches without console errors.
- [ ] Release build produces a working NSIS setup executable.
- [ ] Portable folder runs without Node.js, Rust, or FFmpeg installed globally.
- [ ] App identity is BitBento with no stray brand names.

## Real media

- [ ] Add MP4, MOV, MKV, and WebM files with a native file picker.
- [ ] Drag and drop multiple files.
- [ ] Metadata shown by the UI matches ffprobe.
- [ ] Chinese, Japanese, spaces, apostrophes, and long paths work.
- [ ] A VFR phone video does not display a fabricated constant frame rate.

## Settings

- [ ] Target MB input and slider remain synchronized.
- [ ] Strict target output does not exceed the requested bytes in test cases.
- [ ] Impossible target is rejected before encoding.
- [ ] Professional summary updates live and remains exactly two lines.
- [ ] Container/codec compatibility is enforced.
- [ ] Apply-to-all recalculates each file independently.
- [ ] Changing saved settings marks the file dirty.

## Queue and encoding

- [ ] Queue contains complete post-compression parameters.
- [ ] Real progress, elapsed time, and ETA update during encoding.
- [ ] Cancel stops the FFmpeg process tree and removes partial output.
- [ ] One failed job does not corrupt or silently discard the remaining queue.
- [ ] Output filename collisions are resolved without overwriting.
- [ ] Completed output opens and has expected audio/video streams.
- [ ] Temporary resources and process handles are released after completion.

## Hardware

- [ ] Auto selects only an encoder proven to initialize.
- [ ] NVIDIA, Intel, AMD, and CPU choices fail gracefully when unavailable.
- [ ] Hardware failure may fall back to CPU only after a clear user-visible notice.
- [ ] Strict target behavior is documented when hardware acceleration is selected.

## Privacy and release

- [ ] No network request occurs during normal app use.
- [ ] No telemetry or cloud upload exists.
- [ ] Source video is never modified or overwritten.
- [ ] Installer uninstalls cleanly without deleting user output.
- [ ] FFmpeg source/version/hash/configuration and license are included.
- [ ] SmartScreen/code-signing limitation is documented for unsigned builds.
