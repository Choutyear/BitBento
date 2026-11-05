$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$release = Join-Path $root "release"
$portable = Join-Path $release "BitBento-Portable"

New-Item -ItemType Directory -Path $portable -Force | Out-Null

$exe = Join-Path $root "src-tauri\target\release\bitbento.exe"
if (-not (Test-Path $exe)) { throw "Release executable not found. Run npm run build first." }
Copy-Item $exe (Join-Path $portable "BitBento.exe") -Force

$bundle = Join-Path $root "src-tauri\target\release\bundle\nsis"
$installer = Get-ChildItem $bundle -Filter "*-setup.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $installer) { throw "NSIS installer not found." }
Copy-Item $installer.FullName (Join-Path $release "BitBento-Setup.exe") -Force

$license = Join-Path $root "THIRD_PARTY_LICENSES.txt"
if (Test-Path $license) { Copy-Item $license $release -Force }
Write-Host "Release artifacts collected in $release"
