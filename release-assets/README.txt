BitBento for Windows 11 x64
============================

BitBento performs all video inspection and compression locally. It contains no
account system, telemetry, advertising, upload, or network feature.

Portable: keep BitBento.exe, both FFmpeg sidecar executables, and the licenses
folder together. Windows 11 already includes the required WebView2 runtime.

Outputs are written beside the source video or in the folder selected in the
app. Source files are never modified. Interrupted jobs leave no finalized file.

The preview player reads only videos explicitly selected by the user. Formats
that WebView2 cannot decode are converted to a local temporary compatibility
preview; no media leaves the computer.

Hardware acceleration is validated by actually initializing each encoder. A
strict size limit keeps the selected working hardware encoder and verifies the
result, retrying at a corrected bitrate when required.

This build is unsigned. Windows SmartScreen may display an unknown-publisher
warning. Code signing requires a separately purchased trusted certificate.

FFmpeg licensing and reproducibility details are in THIRD_PARTY_LICENSES.txt
and the licenses folder. Technical logs are stored locally under
%LOCALAPPDATA%\BitBento\logs and are never transmitted.
