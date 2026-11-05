# FFmpeg sidecars

Do not commit unverified executables.

For Windows x64, Tauri expects these filenames:

- `ffmpeg-x86_64-pc-windows-msvc.exe`
- `ffprobe-x86_64-pc-windows-msvc.exe`

Use `scripts/prepare-ffmpeg.ps1` with a trusted FFmpeg ZIP and its independently obtained SHA-256 hash. Preserve the source URL, version, hash, configuration, and license text in `THIRD_PARTY_LICENSES.txt`.

The selected build must include at least H.264, H.265/HEVC, AV1, AAC, NVENC, Intel QSV, and AMD AMF support where permitted by the build and host hardware.
