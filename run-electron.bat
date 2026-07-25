@echo off
setlocal

cd /d "%~dp0"
if not exist "logs" mkdir "logs"
set "LOG_FILE=%CD%\logs\run-electron.log"
set "NODE_EXE=node"

if exist "%LOCALAPPDATA%\nodejs\node-v22.12.0-win-x64\node.exe" (
  set "NODE_EXE=%LOCALAPPDATA%\nodejs\node-v22.12.0-win-x64\node.exe"
  set "PATH=%LOCALAPPDATA%\nodejs\node-v22.12.0-win-x64;%APPDATA%\npm;%PATH%"
)
if exist "C:\Users\liujinhao\AppData\Local\nodejs\node-v22.12.0-win-x64\node.exe" (
  set "NODE_EXE=C:\Users\liujinhao\AppData\Local\nodejs\node-v22.12.0-win-x64\node.exe"
  set "PATH=C:\Users\liujinhao\AppData\Local\nodejs\node-v22.12.0-win-x64;C:\Users\liujinhao\AppData\Roaming\npm;%PATH%"
)
if exist "C:\Users\liujinhao\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  set "NODE_EXE=C:\Users\liujinhao\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  set "PATH=C:\Users\liujinhao\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback;C:\Users\liujinhao\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"
)
if exist "%ProgramFiles%\nodejs\node.exe" (
  set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
  set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
)
if exist "%APPDATA%\npm" (
  set "PATH=%APPDATA%\npm;%PATH%"
)

echo ========================================
echo  Kaoyan English Lab - Electron Desktop
echo ========================================
echo.
echo [%date% %time%] Starting launcher > "%LOG_FILE%"

where node >nul 2>nul
if errorlevel 1 if not exist "%NODE_EXE%" (
  echo [ERROR] Node.js was not found.
  echo Please install Node.js LTS, then run this file again.
  echo Download: https://nodejs.org/
  echo [%date% %time%] Node.js was not found. >> "%LOG_FILE%"
  pause
  exit /b 1
)

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [WARN] pnpm was not found. Build will try npm fallback only if needed.
)

set "HAS_GLOBAL_ELECTRON=0"
where electron >nul 2>nul
if not errorlevel 1 set "HAS_GLOBAL_ELECTRON=1"
where npx >nul 2>nul
if not errorlevel 1 set "HAS_GLOBAL_ELECTRON=1"

if not exist "electron\node_modules\.bin\electron.cmd" if "%HAS_GLOBAL_ELECTRON%"=="0" (
  where pnpm >nul 2>nul
  if not errorlevel 1 (
    echo [INFO] Installing Electron dependencies with pnpm...
    set CI=true
    pnpm --dir electron install --config.confirmModulesPurge=false >> "%LOG_FILE%" 2>&1
  ) else (
    where npm >nul 2>nul
    if not errorlevel 1 (
      echo [WARN] pnpm unavailable. Installing Electron dependencies with isolated npm fallback...
      npm --prefix electron install --no-audit --no-fund >> "%LOG_FILE%" 2>&1
    )
  )
  if not exist "electron\node_modules\.bin\electron.cmd" (
    echo [WARN] Local Electron install failed. Will try global Electron fallback.
  )
)

if not exist "electron\node_modules\.bin\electron.cmd" if "%HAS_GLOBAL_ELECTRON%"=="1" (
  echo [INFO] Using global/npx Electron; local install skipped.
)

where pnpm >nul 2>nul
if not errorlevel 1 (
  if not exist "backend\node_modules\cors" (
    echo [INFO] Backend dependencies are incomplete. Installing workspace dependencies with pnpm...
    set CI=true
    pnpm install --config.confirmModulesPurge=false --no-frozen-lockfile >> "%LOG_FILE%" 2>&1
    if errorlevel 1 (
      echo [ERROR] Backend dependency install failed. See logs\run-electron.log
      echo.
      echo ===== Install error tail =====
      powershell -NoProfile -Command "Get-Content -Path '%LOG_FILE%' -Tail 80"
      echo ==============================
      pause
      exit /b 1
    )
  )
  if not exist "frontend\node_modules\.bin\vite.cmd" (
    echo [INFO] Frontend dependencies are incomplete. Installing with pnpm...
    set CI=true
    pnpm --dir frontend install --config.confirmModulesPurge=false >> "%LOG_FILE%" 2>&1
    if errorlevel 1 (
      echo [ERROR] Frontend dependency install failed. See logs\run-electron.log
      echo.
      echo ===== Install error tail =====
      powershell -NoProfile -Command "Get-Content -Path '%LOG_FILE%' -Tail 80"
      echo ==============================
      pause
      exit /b 1
    )
  )
  echo [INFO] Building frontend to sync latest changes...
  echo [INFO] Build timeout: 60 seconds. Progress:
  powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\buildFrontendWithTimeout.ps1" -TimeoutSeconds 60 -LogFile "logs\run-electron.log"
  if errorlevel 1 (
    if exist "frontend\dist\index.html" (
      echo [WARN] Frontend build failed or timed out. Using previous dist version.
      echo [%date% %time%] Build failed or timed out. Existing dist will be used. >> "%LOG_FILE%"
    ) else (
      echo [ERROR] Frontend build failed or timed out, and frontend\dist\index.html does not exist.
      echo Please run manually:
      echo   pnpm --dir frontend build
      echo.
      echo ===== Build error tail =====
      powershell -NoProfile -Command "Get-Content -Path '%LOG_FILE%' -Tail 80"
      echo ============================
      pause
      exit /b 1
    )
  )
) else (
  where npm >nul 2>nul
  if not errorlevel 1 (
    echo [WARN] pnpm unavailable. Building frontend with npm fallback...
    npm run build --workspace frontend >> "%LOG_FILE%" 2>&1
    if errorlevel 1 (
      if exist "frontend\dist\index.html" (
        echo [WARN] npm fallback build failed. Using previous dist version.
        echo [%date% %time%] npm fallback build failed. Existing dist will be used. >> "%LOG_FILE%"
      ) else (
        echo [ERROR] Frontend build failed and frontend\dist\index.html does not exist.
        echo Please run manually:
        echo   pnpm --dir frontend build
        echo.
        echo ===== Build error tail =====
        powershell -NoProfile -Command "Get-Content -Path '%LOG_FILE%' -Tail 80"
        echo ============================
        pause
        exit /b 1
      )
    )
  ) else (
    echo [WARN] Skipping frontend build because pnpm/npm are unavailable. Existing dist will be used.
  )
)

if exist "electron\node_modules\.bin\electron.cmd" (
  echo [INFO] Starting Electron with local dependency...
  electron\node_modules\.bin\electron.cmd electron\main.js >> "%LOG_FILE%" 2>&1
  goto done
)

where electron >nul 2>nul
if not errorlevel 1 (
  echo [INFO] Starting Electron with global dependency...
  electron electron/main.js >> "%LOG_FILE%" 2>&1
  goto done
)

where npx >nul 2>nul
if not errorlevel 1 (
  echo [INFO] Starting Electron with npx fallback...
  npx electron electron/main.js >> "%LOG_FILE%" 2>&1
  goto done
)

echo [ERROR] Electron was not found locally or globally.
echo Please run one of these commands:
echo   pnpm --dir electron install
echo   npm install -g electron
echo [%date% %time%] Electron was not found. >> "%LOG_FILE%"
pause
exit /b 1

:done
echo.
echo [INFO] Electron app closed. Logs: %LOG_FILE%
pause
exit /b 0
