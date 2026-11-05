@echo off
rem Starts or stops a Quest 2 recording: run it once to start, run it again to stop.
rem A small window shows what is recorded; closing it stops the recording too. The
rem recording window then cuts one eye into recordings\ (see record-quest.ps1).
rem Extra arguments go to record-quest.ps1, for example: record-quest.bat -Layout wide

tasklist /FI "IMAGENAME eq scrcpy.exe" 2>nul | find /I "scrcpy.exe" >nul
if not errorlevel 1 (
  echo Stopping the recording...
  rem Closing the preview window lets scrcpy finish the file; force it only if it hangs.
  taskkill /FI "WINDOWTITLE eq Quest recording" /IM scrcpy.exe >nul 2>&1
  ping -n 6 127.0.0.1 >nul
  tasklist /FI "IMAGENAME eq scrcpy.exe" 2>nul | find /I "scrcpy.exe" >nul && taskkill /IM scrcpy.exe /F >nul
  echo Stopped. The recording window is now cutting the video.
  exit /b 0
)

echo Starting the recording. Run this file again to stop.
start "Quest recorder" cmd /c "powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0record-quest.ps1" -Preview %* & echo. & pause"
