@echo off
setlocal

cd /d "%~dp0"

if exist "%LOCALAPPDATA%\nodejs\node-v22.12.0-win-x64\node.exe" (
  set "PATH=%LOCALAPPDATA%\nodejs\node-v22.12.0-win-x64;%APPDATA%\npm;%PATH%"
)
if exist "C:\Users\liujinhao\AppData\Local\nodejs\node-v22.12.0-win-x64\node.exe" (
  set "PATH=C:\Users\liujinhao\AppData\Local\nodejs\node-v22.12.0-win-x64;C:\Users\liujinhao\AppData\Roaming\npm;%PATH%"
)
if exist "%ProgramFiles%\nodejs\node.exe" (
  set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
)
if exist "C:\Users\liujinhao\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  set "PATH=C:\Users\liujinhao\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback;C:\Users\liujinhao\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"
)

echo [INFO] Starting Electron with existing dist...

if not exist "frontend\dist\index.html" (
  echo [ERROR] frontend\dist\index.html does not exist.
  echo Please build frontend once:
  echo   pnpm --dir frontend build
  pause
  exit /b 1
)

where electron >nul 2>nul
if not errorlevel 1 (
  electron electron/main.js
  pause
  exit /b 0
)

if exist "C:\Users\liujinhao\AppData\Local\nodejs\node-v22.12.0-win-x64\npx.cmd" (
  "C:\Users\liujinhao\AppData\Local\nodejs\node-v22.12.0-win-x64\npx.cmd" electron electron/main.js
  pause
  exit /b 0
)

where npx >nul 2>nul
if not errorlevel 1 (
  npx electron electron/main.js
  pause
  exit /b 0
)

echo [ERROR] Electron/npx was not found.
echo Try in PowerShell:
echo   npm install -g electron
echo   npx electron electron/main.js
pause
exit /b 1
