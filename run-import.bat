@echo off
setlocal EnableExtensions EnableDelayedExpansion

title CET Import Runner

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

set "CODEX_NODE=C:\Users\liujinhao\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "IMPORT_SCRIPT=scripts\runImportWithTimeout.mjs"
set "VERIFY_SCRIPT=scripts\verifyImport.mjs"
set "FAILED_REPORT=backend\data\reports\timeout-import-report.json"

echo ============================================================
echo  CET SQLite Import Runner
echo ============================================================
echo  Project: %PROJECT_DIR%
echo.

echo [1/4] Checking Node.js...
where node >nul 2>nul
if "%ERRORLEVEL%"=="0" (
  set "NODE_EXE=node"
  echo      Found node in PATH.
) else (
  if exist "%CODEX_NODE%" (
    set "NODE_EXE=%CODEX_NODE%"
    echo      Node not found in PATH.
    echo      Using Codex runtime Node:
    echo      %CODEX_NODE%
  ) else (
    echo.
    echo ERROR: Node.js was not found.
    echo Tried PATH and Codex runtime:
    echo %CODEX_NODE%
    echo.
    echo Please install Node.js or check the Codex runtime path.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo [2/4] Node version:
"%NODE_EXE%" --version
if not "%ERRORLEVEL%"=="0" (
  echo.
  echo ERROR: Node.js exists but cannot run.
  echo.
  pause
  exit /b 1
)

echo.
echo [3/4] Starting import with timeout and resume support...
echo      Script: %IMPORT_SCRIPT%
echo      Tip: after each batch, type y and press Enter to continue.
echo.
"%NODE_EXE%" "%IMPORT_SCRIPT%"
set "IMPORT_EXIT=%ERRORLEVEL%"

echo.
if "%IMPORT_EXIT%"=="0" (
  echo Import command finished successfully.
) else (
  echo WARNING: Import command finished with exit code %IMPORT_EXIT%.
  echo Some papers may have failed or timed out. Verification will still run.
)

echo.
echo [4/4] Running verification...
echo      Script: %VERIFY_SCRIPT%
echo.
"%NODE_EXE%" "%VERIFY_SCRIPT%" --failed-report "%FAILED_REPORT%"
set "VERIFY_EXIT=%ERRORLEVEL%"

echo.
echo ============================================================
echo  Finished
echo ============================================================
echo  Import exit code: %IMPORT_EXIT%
echo  Verify exit code: %VERIFY_EXIT%
echo.
echo  Reports:
echo    backend\data\reports\timeout-import-report.json
echo    backend\data\reports\timeout-import-errors.log
echo    backend\data\reports\sqlite-import-verification.json
echo.

if "%VERIFY_EXIT%"=="0" (
  echo RESULT: Verification passed.
) else (
  echo RESULT: Verification found missing or incomplete data.
  echo Open the reports above to see failed papers and reasons.
)

echo.
pause
exit /b %VERIFY_EXIT%
