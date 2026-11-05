# Product specification

## Product identity

- Name: BitBento
- Subtitle: Neatly packed, locally processed
- Platform: Windows 11 x64
- Processing model: fully local and offline after installation
- UI language: Simplified Chinese by default

## Main layout

The approved three-column layout in `frontend/index.html` is authoritative:

1. Media list and batch output settings
2. Selected-file details, preview placeholder, size forecast, and before/after comparison
3. Output settings with two modes
4. Persistent output queue at the bottom

## Media list

- Add one or multiple supported videos using a native Windows file picker or drag and drop.
- Probe every file with ffprobe and show container, duration, size, codec, resolution, frame rate, bitrate, audio, and full path.
- Files cannot be selected for queuing until their parameters have been saved.
- Support Select all, Clear, per-file configuration indicator, and per-file checkbox.
- Do not load full video files into WebView memory.

## Batch output settings

- Filename suffix applies to the whole batch; default `_compressed`.
- Save location choices:
  - Original file folder
  - One custom folder for the whole batch, selected with the native Windows folder picker
- Hardware acceleration choices:
  - Auto (recommended)
  - NVIDIA NVENC
  - Intel Quick Sync
  - AMD AMF
  - CPU only
- Auto must probe actual encoder availability and fall back safely.

## Target-size mode

Keep this mode deliberately simple:

- Editable target size in MB
- One slider linked bidirectionally to the MB value
- Toggle: must not exceed target size
- No manual codec, resolution, frame-rate, or audio controls
- Default behavior aims as close as practical to the target
- Strict behavior reserves a safety margin and must verify the final size; if necessary, retry once with a corrected bitrate
- Display automatic codec, unchanged resolution/frame rate, and estimated quality

Bitrate calculation must reserve audio and container overhead:

`video_bitrate_kbps = ((target_bytes * 8 / duration_seconds) / 1000) - audio_kbps - overhead_kbps`

Reject impossible targets with a clear Chinese explanation instead of starting a doomed encode.

## Professional mode

Controls:

- Container: Same as source, MP4, MKV, MOV, WebM
- Video codec: Same as source, H.264, H.265, AV1, VP9 when compatible
- Average video bitrate slider, step 0.1 Mbps
- Resolution: Same as source, 4K, 2K, 1080p, 720p
- Frame rate: Same as source, 60, 50, 30, 25, 24 FPS
- Audio: Same as source, AAC 256, AAC 192, AAC 128, remove audio
- VBR is automatic; do not add a CBR/VBR selector

The live parameter summary uses exactly two lines:

- `MP4 · H.265 · 3840×2160 · 60 FPS`
- `8.2 Mbps · AAC 192 kbps`

Estimated file size uses the older compact right-aligned information-row style, not a large highlighted card.

## Save and queue logic

- `保存当前参数`: save only the selected file and enable its checkbox.
- `保存当前文件参数并应用到全部`: copy compatible settings to every media item, recalculate per-file estimates, and mark all configured.
- If a saved file's controls change, mark it dirty and require saving again.
- `加入输出队列` adds only checked and configured files.
- Queue entries display filename, container, codec, resolution, frame rate, bitrate, audio, predicted size, hardware mode, and status.

## Processing behavior

- States: queued, probing, encoding pass 1, encoding pass 2, verifying, completed, failed, cancelled.
- Show per-job percentage, elapsed time, estimated remaining time, and current pass.
- Allow cancelling the current job and removing waiting jobs.
- Process one job at a time by default. Do not run parallel encodes unless later added as an advanced option.
- Prevent Windows sleep while actively encoding and release the request afterwards.
- On success, offer Open file and Open folder.
- Never overwrite a source file. Resolve collisions with ` (1)`, ` (2)`, etc.

## Error handling

- Preserve the queue after an individual failure and continue when safe.
- Remove `.part` output on cancel/failure only after the process has stopped.
- Show user-friendly Chinese errors with a collapsible technical detail.
- Store local rotating logs without paths or metadata being transmitted anywhere.
