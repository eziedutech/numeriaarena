# Records the Quest 2 view over USB with scrcpy, passthrough included (the headset's own
# recording and casting show black in real mode), then cuts one eye into a 1920x1080 video
# with a blurred fill at the sides, ready for the demo edit. Files go to recordings/ (git-ignored).
#
#   .\scripts\record-quest.ps1                 # record until Ctrl+C
#   .\scripts\record-quest.ps1 -Seconds 60     # record 60 s
#   .\scripts\record-quest.ps1 -Layout wide    # 4:3 cut of the eye's middle instead of its full height
#
# Needs: the headset on your head (no frames come while it sleeps), USB debugging allowed,
# scrcpy (https://github.com/Genymobile/scrcpy/releases) and ffmpeg.
param(
  [int]$Seconds = 0,
  [ValidateSet('tall', 'wide')][string]$Layout = 'tall',
  [string]$OutDir = (Join-Path (Split-Path $PSScriptRoot) 'recordings'),
  [string]$Scrcpy = '',
  [string]$Adb = ''
)
$ErrorActionPreference = 'Stop'

function Find-Tool([string]$given, [string]$name, [string[]]$places) {
  if ($given) { return $given }
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($p in $places) { if (Test-Path $p) { return $p } }
  throw "$name not found; pass -$($name -replace '\.exe$','') <path>"
}

$Scrcpy = Find-Tool $Scrcpy 'scrcpy.exe' @("$HOME\tools\scrcpy\scrcpy.exe")
$Adb = Find-Tool $Adb 'adb.exe' @("$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe", (Join-Path (Split-Path $Scrcpy) 'adb.exe'))
$null = Find-Tool '' 'ffmpeg.exe' @()
$env:ADB = $Adb

New-Item -ItemType Directory -Force $OutDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$raw = Join-Path $OutDir "quest-$stamp-raw.mkv"
$out = Join-Path $OutDir "quest-$stamp.mp4"

# The only encoder on Quest 2 that keeps running; the c2.qti ones stop with
# "Pending dequeue output buffer request cancelled". MKV stays readable if stopped with Ctrl+C.
$scArgs = @('--no-window', '--no-audio', '--video-codec=h264', '--video-encoder=OMX.qcom.video.encoder.avc',
  '--max-size=1920', '--max-fps=30', "--record=$raw")
if ($Seconds -gt 0) { $scArgs += "--time-limit=$Seconds" }

# The left eye, as a share of the side-by-side frame, inside the lens edge.
$cut = if ($Layout -eq 'tall') { 'crop=iw*0.452:ih*0.93:iw*0.014:ih*0.03' } else { 'crop=iw*0.452:ih*0.47:iw*0.014:ih*0.25' }
$filter = "[0:v]$cut,split[a][b];" +
  "[b]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=30,eq=brightness=-0.15[bg];" +
  "[a]scale=-2:1080[fg];[bg][fg]overlay=(W-w)/2:0,format=yuv420p"

Write-Host "Recording to $raw" -ForegroundColor Cyan
if ($Seconds -le 0) { Write-Host 'Press Ctrl+C to stop.' -ForegroundColor Cyan }
try {
  & $Scrcpy @scArgs
} finally {
  if ((Test-Path $raw) -and (Get-Item $raw).Length -gt 0) {
    Write-Host "Cutting one eye to $out" -ForegroundColor Cyan
    & ffmpeg -nostdin -loglevel error -y -i $raw -filter_complex $filter -c:v libx264 -crf 18 -preset medium -r 30 $out
    if (Test-Path $out) { Write-Host "Done: $out (raw kept: $raw)" -ForegroundColor Green }
  } else {
    Write-Host 'Nothing was recorded. Is the headset on your head and USB debugging allowed?' -ForegroundColor Yellow
  }
}
