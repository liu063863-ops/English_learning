$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodeExe = "C:\Users\liujinhao\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$BackendEntry = Join-Path $Root "backend\src\index.js"
$LogFile = Join-Path $Root "backend\server.log"

if (-not (Test-Path $NodeExe)) {
  $NodeExe = "node"
}

$env:PORT = "4187"
$existing = Get-NetTCPConnection -LocalPort 4187 -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $existing) {
  Start-Process -FilePath $NodeExe -ArgumentList "`"$BackendEntry`"" -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput $LogFile -RedirectStandardError (Join-Path $Root "backend\server-error.log")
  Start-Sleep -Seconds 2
}

$url = "http://127.0.0.1:4187/desktop"
$edge = Get-Command msedge -ErrorAction SilentlyContinue
if ($edge) {
  Start-Process -FilePath $edge.Source -ArgumentList @("--app=$url")
} else {
  Start-Process $url
}
