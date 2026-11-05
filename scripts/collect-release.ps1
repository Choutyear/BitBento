$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$release = Join-Path $root "release"
$portable = Join-Path $release "BitBento-Portable"

if (Test-Path $portable) {
  $resolvedRelease = [IO.Path]::GetFullPath($release).TrimEnd('\') + '\'
  $resolvedPortable = [IO.Path]::GetFullPath($portable)
  if (-not $resolvedPortable.StartsWith($resolvedRelease, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clean portable path outside the release directory: $resolvedPortable"
  }
  Remove-Item -LiteralPath $resolvedPortable -Recurse -Force
}
New-Item -ItemType Directory -Path $portable -Force | Out-Null

$exe = Join-Path $root "src-tauri\target\release\bitbento.exe"
if (-not (Test-Path $exe)) { throw "Release executable not found. Run npm run build first." }
Copy-Item $exe (Join-Path $portable "BitBento.exe") -Force

$sidecars = @(
  "ffmpeg-x86_64-pc-windows-msvc.exe",
  "ffprobe-x86_64-pc-windows-msvc.exe"
)
foreach ($sidecar in $sidecars) {
  $source = Join-Path $root "src-tauri\target\release\$sidecar"
  if (-not (Test-Path $source)) { $source = Join-Path $root "src-tauri\binaries\$sidecar" }
  if (-not (Test-Path $source)) { throw "Portable sidecar missing: $sidecar" }
  Copy-Item $source (Join-Path $portable $sidecar) -Force
}

$bundle = Join-Path $root "src-tauri\target\release\bundle\nsis"
$installer = Get-ChildItem $bundle -Filter "*-setup.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $installer) { throw "NSIS installer not found." }
Copy-Item $installer.FullName (Join-Path $release "BitBento-Setup.exe") -Force

$license = Join-Path $root "THIRD_PARTY_LICENSES.txt"
if (Test-Path $license) {
  Copy-Item $license $release -Force
  Copy-Item $license $portable -Force
}
$projectLicense = Join-Path $root "LICENSE"
if (Test-Path $projectLicense) {
  Copy-Item $projectLicense (Join-Path $release "LICENSE.txt") -Force
  Copy-Item $projectLicense (Join-Path $portable "LICENSE.txt") -Force
}
$ffmpegLicenses = Join-Path $root "src-tauri\binaries\licenses"
if (Test-Path $ffmpegLicenses) { Copy-Item $ffmpegLicenses (Join-Path $portable "licenses") -Recurse -Force }
$releaseReadme = Join-Path $root "release-assets\README.txt"
if (Test-Path $releaseReadme) {
  Copy-Item $releaseReadme $release -Force
  Copy-Item $releaseReadme $portable -Force
}
Write-Host "Release artifacts collected in $release"
