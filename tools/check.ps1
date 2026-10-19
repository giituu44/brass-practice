# One-click check of Brass Practice:
#   1. every script parses (needs Node.js; skipped if it isn't installed),
#   2. sw.js (the offline copy) lists every file the app loads, and its versions match
#      the files: after a change it's given new ones, so installed apps get the update,
#   3. tests.html passes, from disk, in a headless Edge or Chrome — including the app
#      smoke test, which opens every tab and watches for errors.
# It uses its own browser profile, so your saved progress is never touched.
# Run:  powershell -ExecutionPolicy Bypass -File tools\check.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$failed = 0

Write-Host "Syntax" -ForegroundColor Cyan
if (Get-Command node -ErrorAction SilentlyContinue) {
  $files = @(Get-ChildItem "$root\js\*.js") + @(Get-Item "$root\fingerings.js") + @(Get-Item "$root\sw.js")
  foreach ($f in $files) {
    $err = & node --check $f.FullName 2>&1
    if ($LASTEXITCODE -ne 0) { Write-Host "  x $($f.Name)" -ForegroundColor Red; $err | Select-Object -First 4 | ForEach-Object { Write-Host "    $_" }; $failed++ }
  }
  if (-not $failed) { Write-Host "  ok: $($files.Count) scripts" -ForegroundColor Green }
} else {
  Write-Host "  skipped (Node.js isn't installed)" -ForegroundColor Yellow
}

Write-Host "Offline copy (sw.js)" -ForegroundColor Cyan
$swPath = "$root\sw.js"
$sw = [IO.File]::ReadAllText($swPath)
function SwList($name) {
  $block = [regex]::Match($sw, "const $name = \[([\s\S]*?)\];").Groups[1].Value
  [regex]::Matches($block, "'([^']+)'") | ForEach-Object { $_.Groups[1].Value }
}
$shell = @(SwList 'SHELL_FILES'); $sounds = @(SwList 'SOUND_FILES')
$index = [IO.File]::ReadAllText("$root\index.html")
$manifest = [IO.File]::ReadAllText("$root\manifest.webmanifest")
$need = @([regex]::Matches($index, '(?:src|href)="([^":#?]+)"') | ForEach-Object { $_.Groups[1].Value }) + @('index.html', 'manifest.webmanifest') +
  @([regex]::Matches($manifest, '"src": "([^"]+)"') | ForEach-Object { $_.Groups[1].Value }) +
  @(Get-ChildItem "$root\js\*.js" | ForEach-Object { "js/$($_.Name)" }) +
  @(Get-ChildItem "$root\vendor\pdfjs\*.js" | ForEach-Object { "vendor/pdfjs/$($_.Name)" })
$problems = @()
foreach ($f in $need | Select-Object -Unique) { if ($shell -notcontains $f) { $problems += "$f isn't in SHELL_FILES" } }
foreach ($f in Get-ChildItem "$root\sounds\*.js") { if ($sounds -notcontains "sounds/$($f.Name)") { $problems += "sounds/$($f.Name) isn't in SOUND_FILES" } }
foreach ($f in $shell + $sounds) { if (-not (Test-Path "$root\$f")) { $problems += "$f is listed but doesn't exist" } }
if ($problems) {
  $problems | ForEach-Object { Write-Host "  x $_" -ForegroundColor Red }; $failed++
} else {
  # A version is a fingerprint of the files' contents (and the list).
  function Fingerprint($list) {
    $text = ($list | ForEach-Object { "$_ $((Get-FileHash "$root\$_" -Algorithm SHA256).Hash)" }) -join "`n"
    $sha = [System.Security.Cryptography.SHA256]::Create()
    -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text))[0..4] | ForEach-Object { $_.ToString('x2') })
  }
  $shellV = Fingerprint $shell; $soundsV = Fingerprint $sounds
  $new = $sw -replace "const SHELL_VERSION = '[^']*';", "const SHELL_VERSION = '$shellV';" -replace "const SOUNDS_VERSION = '[^']*';", "const SOUNDS_VERSION = '$soundsV';"
  if ($new -ne $sw) {
    [IO.File]::WriteAllText($swPath, $new, (New-Object Text.UTF8Encoding $false))
    Write-Host "  files changed: sw.js now has version $shellV (sounds $soundsV) - publish sw.js with them" -ForegroundColor Yellow
  } else {
    Write-Host "  ok: $($shell.Count) files and $($sounds.Count) sound sets, version $shellV" -ForegroundColor Green
  }
}

Write-Host "Tests and smoke test (headless browser, from disk)" -ForegroundColor Cyan
$browser = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $browser) {
  Write-Host "  skipped (no Edge or Chrome found) - open tests.html in a browser instead" -ForegroundColor Yellow
} else {
  $url = "file:///" + ($root -replace '\\', '/') + "/tests.html"
  $out = [System.IO.Path]::GetTempFileName()
  $profileDir = Join-Path $env:TEMP "brass-practice-check"
  # The smoke test looks inside the app's frame, which browsers keep apart for pages
  # opened from disk; these flags lift that for this throwaway headless profile only.
  Start-Process -FilePath $browser -ArgumentList @('--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--disable-web-security', "--user-data-dir=$profileDir",
    '--autoplay-policy=no-user-gesture-required', '--virtual-time-budget=25000', '--dump-dom', $url) -RedirectStandardOutput $out -Wait -WindowStyle Hidden
  $dom = Get-Content $out -Raw -Encoding UTF8
  Remove-Item $out -ErrorAction SilentlyContinue
  $m = [regex]::Match($dom, '<div id="summary" class="(\w+)">([^<]*)</div>')
  if (-not $m.Success) {
    Write-Host "  x the test page didn't finish" -ForegroundColor Red; $failed++
  } else {
    $color = if ($m.Groups[1].Value -eq 'ok') { 'Green' } else { 'Red' }
    Write-Host "  $($m.Groups[2].Value)" -ForegroundColor $color
    foreach ($f in [regex]::Matches($dom, '<div class="t fail">(.*?)</div>')) {
      Write-Host ("    x " + ($f.Groups[1].Value -replace '<[^>]+>', ' ' -replace '\s+', ' ')) -ForegroundColor Red
    }
    if ($m.Groups[1].Value -ne 'ok') { $failed++ }
    if ($dom -match '<div class="t">✓ The app loads') { Write-Host "  (including the app smoke test: every tab opened)" -ForegroundColor Green }
    else { Write-Host "  (the app smoke test was skipped)" -ForegroundColor Yellow }
  }
}

if ($failed) { Write-Host "FAILED" -ForegroundColor Red; exit 1 } else { Write-Host "All good" -ForegroundColor Green }
