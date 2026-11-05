# Records the Quest 2 view over USB with scrcpy, passthrough included (the headset's own
# recording and casting show black in real mode), then cuts one eye into a 1920x1080 video
# unbent from the lens and with a blurred fill at the sides, ready for the demo edit.
# Files go to recordings/ (git-ignored).
#
#   .\scripts\record-quest.ps1                 # record until Ctrl+C
#   .\scripts\record-quest.ps1 -Seconds 60     # record 60 s
#   .\scripts\record-quest.ps1 -Layout wide    # 4:3 cut of the eye's middle instead of its full height
#   .\scripts\record-quest.ps1 -From recordings\quest-...-raw.mkv   # cut an earlier raw recording again
#
# Needs: the headset on your head (no frames come while it sleeps), USB debugging allowed,
# scrcpy (https://github.com/Genymobile/scrcpy/releases) and ffmpeg.
param(
  [int]$Seconds = 0,
  [ValidateSet('tall', 'wide')][string]$Layout = 'tall',
  [string]$OutDir = (Join-Path (Split-Path $PSScriptRoot) 'recordings'),
  [string]$From = '',
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

$null = Find-Tool '' 'ffmpeg.exe' @()
New-Item -ItemType Directory -Force $OutDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$raw = if ($From) { (Resolve-Path $From).Path } else { Join-Path $OutDir "quest-$stamp-raw.mkv" }
$out = Join-Path $OutDir "quest-$stamp-$Layout.mp4"

# The left eye, unbent: the headset bends its picture outward so it looks straight through the
# lens, so it is bent back (k1 -0.25, on a frame widened first so its edges stay), then cut
# inside the lens edge.
$unbend = 'crop=iw/2:ih:0:0,pad=iw*1.3:ih*1.3:(ow-iw)/2:(oh-ih)/2,lenscorrection=k1=-0.25:k2=0'
$cut = if ($Layout -eq 'tall') { 'crop=iw*0.65:ih*0.67:iw*0.15:ih*0.13' } else { 'crop=iw*0.65:ih*0.336:iw*0.15:ih*0.29' }
$filter = "[0:v]$unbend,$cut,split[a][b];" +
  "[b]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=30,eq=brightness=-0.15[bg];" +
  "[a]scale=-2:1080[fg];[bg][fg]overlay=(W-w)/2:0,format=yuv420p"

function Cut-Eye {
  if ((Test-Path $raw) -and (Get-Item $raw).Length -gt 0) {
    Write-Host "Cutting one eye to $out" -ForegroundColor Cyan
    & ffmpeg -nostdin -loglevel error -y -i $raw -filter_complex $filter -c:v libx264 -crf 18 -preset medium -r 30 $out
    if (Test-Path $out) { Write-Host "Done: $out (raw kept: $raw)" -ForegroundColor Green }
  } else {
    Write-Host 'Nothing was recorded. Is the headset on your head and USB debugging allowed?' -ForegroundColor Yellow
  }
}

if ($From) { Cut-Eye; return }

$Scrcpy = Find-Tool $Scrcpy 'scrcpy.exe' @("$HOME\tools\scrcpy\scrcpy.exe")
$env:ADB = Find-Tool $Adb 'adb.exe' @("$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe", (Join-Path (Split-Path $Scrcpy) 'adb.exe'))

# The only encoder on Quest 2 that keeps running; the c2.qti ones stop with
# "Pending dequeue output buffer request cancelled". MKV stays readable if stopped with Ctrl+C.
$scArgs = @('--no-window', '--no-audio', '--video-codec=h264', '--video-encoder=OMX.qcom.video.encoder.avc',
  '--max-size=1920', '--max-fps=30', "--record=$raw")
if ($Seconds -gt 0) { $scArgs += "--time-limit=$Seconds" }

Write-Host "Recording to $raw" -ForegroundColor Cyan
if ($Seconds -le 0) { Write-Host 'Press Ctrl+C to stop.' -ForegroundColor Cyan }
try {
  & $Scrcpy @scArgs
} finally {
  Cut-Eye
}
