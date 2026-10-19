# Makes the app icons (icons/*.png) from icons/icon.svg and icons/icon-maskable.svg,
# drawn by a headless Edge or Chrome. Run it again after changing either SVG:
#   powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$browser = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $browser) { Write-Host "No Edge or Chrome found" -ForegroundColor Red; exit 1 }
$profileDir = Join-Path $env:TEMP "brass-practice-icons"

# The rounded icon for browsers and desktops; the full-bleed one for phones, which cut
# their own shape (Android "maskable", and iOS's home screen icon).
$icons = @(
  @{ svg = 'icon.svg'; png = 'icon-192.png'; size = 192 },
  @{ svg = 'icon.svg'; png = 'icon-512.png'; size = 512 },
  @{ svg = 'icon-maskable.svg'; png = 'icon-maskable-512.png'; size = 512 },
  @{ svg = 'icon-maskable.svg'; png = 'apple-touch-icon.png'; size = 180 }
)
foreach ($i in $icons) {
  $out = Join-Path $root "icons\$($i.png)"
  $url = "file:///" + ($root -replace '\\', '/') + "/icons/$($i.svg)"
  Start-Process -FilePath $browser -ArgumentList @('--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--default-background-color=00000000', "--user-data-dir=$profileDir", "--window-size=$($i.size),$($i.size)", "--screenshot=$out", $url) -Wait -WindowStyle Hidden
  if (Test-Path $out) { Write-Host "  icons\$($i.png) ($($i.size) px)" -ForegroundColor Green }
  else { Write-Host "  x icons\$($i.png) wasn't made" -ForegroundColor Red; exit 1 }
}
