param(
  [Parameter(Mandatory = $true)][string]$FfmpegSource,
  [Parameter(Mandatory = $true)][string]$FfmpegSha256,
  [Parameter(Mandatory = $true)][string]$FfmpegProvider
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$manifest = Join-Path $root "src-tauri\Cargo.toml"
$binaryRoot = Join-Path $root "src-tauri\binaries"
$licenseRoot = Join-Path $binaryRoot "licenses"
$rustLicenseRoot = Join-Path $licenseRoot "rust"
$ffmpeg = Join-Path $binaryRoot "ffmpeg-x86_64-pc-windows-msvc.exe"

if (-not (Test-Path $ffmpeg)) { throw "Prepared FFmpeg sidecar not found." }
if (Test-Path $rustLicenseRoot) { Remove-Item -LiteralPath $rustLicenseRoot -Recurse -Force }
New-Item -ItemType Directory -Path $rustLicenseRoot -Force | Out-Null

$metadata = (& cargo metadata --format-version 1 --locked --filter-platform x86_64-pc-windows-msvc --manifest-path $manifest | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) { throw "cargo metadata failed." }
$resolvedIds = $metadata.resolve.nodes.id
$packages = $metadata.packages | Where-Object { $_.name -ne "bitbento" -and $_.id -in $resolvedIds } | Sort-Object name, version -Unique

$inventory = [System.Collections.Generic.List[string]]::new()
foreach ($package in $packages) {
  $license = if ($package.license) { $package.license } else { "See bundled package files" }
  $inventory.Add("- $($package.name) $($package.version): $license")
  $packageDir = Split-Path -Parent $package.manifest_path
  $targetDir = Join-Path $rustLicenseRoot ("{0}-{1}" -f $package.name, $package.version)
  $notices = Get-ChildItem $packageDir -File | Where-Object { $_.Name -match '^(LICENSE|LICENCE|COPYING|NOTICE)(\..*)?$' }
  if ($notices) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    foreach ($notice in $notices) { Copy-Item $notice.FullName (Join-Path $targetDir $notice.Name) -Force }
  }
}

$version = (& $ffmpeg -hide_banner -version | Select-Object -First 1)
$configuration = (& $ffmpeg -hide_banner -buildconf 2>&1 | Out-String).Trim()
$content = @"
BitBento third-party notices
============================

Generated from Cargo.lock and the verified bundled binaries. Full license,
copying, and notice files are distributed in the adjacent licenses directory.

FFmpeg / ffprobe
----------------
Version: $version
Source archive: $FfmpegSource
Archive SHA-256: $($FfmpegSha256.ToLowerInvariant())
Source code: https://github.com/FFmpeg/FFmpeg
Build provider: $FfmpegProvider
License: GNU General Public License version 3 or later for this configured build.
The corresponding source and build scripts are linked by the build provider.

Build configuration:
$configuration

Rust packages linked into BitBento
-----------------------------------
$($inventory -join "`r`n")

JavaScript build dependencies
-----------------------------
- @tauri-apps/cli: Apache-2.0 OR MIT (build-time only)
- @tauri-apps/api: Apache-2.0 OR MIT (not loaded from a network or CDN)

BitBento contains no telemetry, advertising, cloud upload, or account SDK.
"@

$content | Set-Content -Encoding UTF8 (Join-Path $root "THIRD_PARTY_LICENSES.txt")
Write-Host "Generated third-party inventory for $($packages.Count) Rust packages."
