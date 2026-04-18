<#
.SYNOPSIS
  Pakuje FPS Forge portable .exe sa ugradjenim license API URL-om (za Gumroad kupce).

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
Write-Host ""
Write-Host "GOTOVO. Portable exe je u:" -ForegroundColor Green
Write-Host "  $release" -ForegroundColor Yellow
Get-ChildItem $release -Filter "*.exe" -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  -> $($_.FullName)" }
