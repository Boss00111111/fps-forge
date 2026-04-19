<#
.SYNOPSIS
  Pakuje FPS Forge (zip + win-unpacked) sa ugradjenim license API URL-om. Za jedan .exe: npm run dist:portable izvan OneDrive.

.DESCRIPTION
  Postavi FPSFORGE_LICENSE_BUNDLE_API i pokrene npm run dist.
  Primjer:
    .\scripts\build-for-customers.ps1 -LicenseApiUrl "https://fpsforge-xxx.onrender.com"
#>
param(
  [Parameter(Mandatory = $true)]
  [string] $LicenseApiUrl
)

$ErrorActionPreference = "Stop"
# Skripta je u boost-pc-desktop/scripts/
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
if (-not (Test-Path (Join-Path $root "package.json"))) {
  Write-Host "Nisam nasao package.json u $root — pokreni skriptu iz boost-pc-desktop projekta." -ForegroundColor Red
  exit 1
}

$url = $LicenseApiUrl.Trim().TrimEnd("/")
if ($url -notmatch "^https://") {
  Write-Host "URL mora pocinjati sa https:// (Render ti to daje)." -ForegroundColor Red
  exit 1
}

Write-Host "Root: $root" -ForegroundColor Cyan
Write-Host "License API: $url" -ForegroundColor Cyan

# NSIS/7z temp files + output in OneDrive can break portable packaging; keep temp off synced folders.
$buildTemp = Join-Path $env:LOCALAPPDATA "fpsforge-eb-temp"
New-Item -ItemType Directory -Force -Path $buildTemp | Out-Null
$env:TEMP = $buildTemp
$env:TMP = $buildTemp

Push-Location $root
try {
  $env:FPSFORGE_LICENSE_BUNDLE_API = $url
  npm run dist:release
  if ($LASTEXITCODE -ne 0) { throw "npm run dist:release failed" }
}
finally {
  Remove-Item Env:FPSFORGE_LICENSE_BUNDLE_API -ErrorAction SilentlyContinue
  Pop-Location
}

$release = Join-Path $root "release"
$localCopy = Join-Path $env:LOCALAPPDATA "FPSForge"
Write-Host ""
Write-Host "GOTOVO. Portable exe je u:" -ForegroundColor Green
Write-Host "  $release" -ForegroundColor Yellow
Get-ChildItem $release -Filter "*.exe" -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  -> $($_.FullName)" }
Write-Host ""
Write-Host "Pokretanje iz OneDrive mape cesto daje 'file not found'. Kopija na lokalnom disku:" -ForegroundColor Green
Write-Host "  $localCopy" -ForegroundColor Yellow
Get-ChildItem $localCopy -Filter "FPS-Forge-*" -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  -> $($_.FullName)" }
Write-Host ""
Write-Host "Za test bez zipa: $release\win-unpacked\FPS Forge.exe" -ForegroundColor DarkGray
