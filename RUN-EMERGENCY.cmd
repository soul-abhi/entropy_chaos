@echo off
setlocal
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\scripts\run-all.ps1"
if errorlevel 1 (
  echo.
  echo Emergency run failed. Check terminal output above.
  pause
  exit /b 1
)
echo.
echo Emergency run completed.
pause
