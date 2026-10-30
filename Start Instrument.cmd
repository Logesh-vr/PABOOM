@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.12 or newer, then open this file again.
  pause
  exit /b 1
)
if not exist "node_modules\vite" (
  echo First-time setup: open a terminal here and run npm install.
  pause
  exit /b 1
)
call npm.cmd run dev -- --open
pause
