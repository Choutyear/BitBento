param(
  [Parameter(Mandatory = $true)][string]$ArchivePath,
  [Parameter(Mandatory = $true)][string]$ExpectedSha256
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$archive = (Resolve-Path $ArchivePath).Path
$actual = (Get-FileHash -Algorithm SHA256 $archive).Hash.ToLowerInvariant()
$expected = $ExpectedSha256.Trim().ToLowerInvariant()

if ($actual -ne $expected) {
  throw "FFmpeg archive SHA-256 mismatch. Expected $expected, got $actual."
}

$temp = Join-Path ([System.IO.Path]::GetTempPath()) ("bitbento-ffmpeg-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $temp | Out-Null

try {
  Expand-Archive -Path $archive -DestinationPath $temp -Force
  $ffmpeg = Get-ChildItem $temp -Recurse -Filter ffmpeg.exe | Select-Object -First 1
  $ffprobe = Get-ChildItem $temp -Recurse -Filter ffprobe.exe | Select-Object -First 1
  if (-not $ffmpeg -or -not $ffprobe) { throw "Archive does not contain ffmpeg.exe and ffprobe.exe." }

  $target = Join-Path $root "src-tauri\binaries"
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  Copy-Item $ffmpeg.FullName (Join-Path $target "ffmpeg-x86_64-pc-windows-msvc.exe") -Force
  Copy-Item $ffprobe.FullName (Join-Path $target "ffprobe-x86_64-pc-windows-msvc.exe") -Force

  & (Join-Path $target "ffmpeg-x86_64-pc-windows-msvc.exe") -hide_banner -version
  & (Join-Path $target "ffprobe-x86_64-pc-windows-msvc.exe") -hide_banner -version
  Write-Host "Verified FFmpeg sidecars prepared successfully."
}
finally {
  if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
}
