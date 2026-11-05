# Architecture

## Boundary

The WebView owns presentation and user interaction. Rust owns filesystem access, ffprobe, FFmpeg execution, process lifecycle, output verification, and logs.

Do not let the frontend pass raw command lines. It sends typed job settings; Rust validates and converts them into argument arrays.

## Suggested Rust modules

```text
src-tauri/src/
  main.rs
  commands.rs
  models.rs
  probe.rs
  encoder.rs
  hardware.rs
  queue.rs
  progress.rs
  paths.rs
  errors.rs
```

## Core models

- `MediaInfo`: id, path, filename, extension, container, sizeBytes, durationMs, videoCodec, width, height, frameRate, averageBitrateKbps, audioCodec, audioBitrateKbps, audioChannels
- `OutputSettings`: mode, container, videoCodec, bitrateKbps, width, height, frameRate, audioMode, audioBitrateKbps, targetBytes, strictTarget, hardwareMode, suffix, outputDirectoryMode, customOutputDirectory
- `EncodeJob`: id, media, settings, outputPath, estimatedBytes, state, progress, error
- `ProgressEvent`: jobId, state, pass, outTimeMs, durationMs, percent, speed, fps, elapsedMs, remainingMs

## Tauri commands

- `select_media_files`
- `select_output_directory`
- `probe_media`
- `detect_hardware_encoders`
- `estimate_job`
- `enqueue_jobs`
- `start_queue`
- `cancel_job`
- `remove_job`
- `open_output_file`
- `open_output_folder`
- `get_app_info`

Prefer native Rust-side dialog commands when returning canonical Windows paths. If using the dialog plugin directly, restrict permissions to only required operations.

## FFprobe

Use a fixed argument array similar to:

```text
-v error -show_format -show_streams -of json <input>
```

Parse rational frame rates accurately. Handle absent bitrate fields and variable-frame-rate media without inventing values.

## FFmpeg progress

Use `-progress pipe:1 -nostats` and parse key/value lines. Progress is based on `out_time_ms / duration_ms`, clamped below 100 until verification succeeds.

Spawn without a shell, capture stdout/stderr asynchronously, retain the child handle, and terminate its process tree on cancellation.

## Codec mapping

CPU defaults:

- H.264: `libx264`
- H.265: `libx265`
- AV1: choose an encoder present in the bundled build and document it
- VP9: `libvpx-vp9`

Hardware mapping after capability detection:

- NVIDIA: `h264_nvenc`, `hevc_nvenc`, AV1 only when reported available
- Intel: `h264_qsv`, `hevc_qsv`, AV1 only when reported available
- AMD: `h264_amf`, `hevc_amf`, AV1 only when reported available

Never assume that the presence of an encoder name means the current GPU/driver can initialize it. Run a lightweight initialization probe and cache the result for the session.

## Target-size strategy

- Non-strict target: calculated bitrate, VBR encode, one output verification.
- Strict target: prefer software two-pass for predictable size; reserve 3% by default, verify, and allow one corrective retry.
- Hardware encoders may not provide reliable two-pass target sizing. In strict mode, either switch to software with a visible explanation or use a tested constrained strategy and still verify.
- Clamp calculated bitrate to codec/resolution-dependent minimums and explain impossible requests.

## Safe output

- Encode to `<final-name>.part.<extension>` in the destination directory.
- Verify that output exists, duration is plausible, streams are readable, and size satisfies strict target when enabled.
- Rename to the final filename only after successful verification.
- Source and destination canonical paths must never be identical.

## Frontend migration

The current HTML contains embedded demo arrays and simulated handlers. Split it into `index.html`, `styles.css`, and `app.js` if helpful, but preserve the visual result. Replace demo state with a store populated by backend responses and Tauri events.

Do not retain sample media or pre-filled queue items in production.
