@echo off
setlocal
powershell.exe -NoLogo -NoProfile -STA -ExecutionPolicy RemoteSigned -File "%~dp0Publish-AndroidUpdate.ps1" %*
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
