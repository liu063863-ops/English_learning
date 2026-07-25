$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

if (-not (Test-Path "logs")) {
  New-Item -ItemType Directory -Path "logs" | Out-Null
}

$logFile = Join-Path $projectRoot "logs\run-electron-dev.log"
"[$(Get-Date)] Starting Electron dev launcher" | Set-Content -Path $logFile -Encoding UTF8

$nodeDir = "C:\Users\liujinhao\AppData\Local\nodejs\node-v22.12.0-win-x64"
$npmGlobal = "C:\Users\liujinhao\AppData\Roaming\npm"
$npxCmd = Join-Path $nodeDir "npx.cmd"
$electronCmd = Join-Path $npmGlobal "electron.cmd"
if (Test-Path $nodeDir) {
  $env:PATH = "$nodeDir;$npmGlobal;$env:PATH"
}

$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"

if (-not (Test-Path "frontend\dist\index.html")) {
  Write-Host "[ERROR] frontend\dist\index.html does not exist."
  Write-Host "Please run: pnpm --dir frontend build"
  "[$(Get-Date)] Missing frontend dist" | Add-Content -Path $logFile
  Read-Host "Press Enter to exit"
  exit 1
}

Write-Host "[INFO] Starting Electron with existing dist..."
Write-Host "[INFO] Project: $projectRoot"

try {
  if (Test-Path $electronCmd) {
    Start-Process -FilePath $electronCmd -ArgumentList @("electron/main.js") -WorkingDirectory $projectRoot
  } elseif (Test-Path $npxCmd) {
    Start-Process -FilePath $npxCmd -ArgumentList @("electron", "electron/main.js") -WorkingDirectory $projectRoot
  } else {
    Start-Process -FilePath "npx" -ArgumentList @("electron", "electron/main.js") -WorkingDirectory $projectRoot
  }
} catch {
  "[ERROR] $($_.Exception.Message)" | Add-Content -Path $logFile
  Write-Host "[ERROR] Electron failed to start. Log: $logFile"
  Read-Host "Press Enter to exit"
  exit 1
}
