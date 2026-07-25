param(
  [int]$TimeoutSeconds = 60,
  [string]$LogFile = "logs\run-electron.log"
)

$ErrorActionPreference = "Stop"
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$logPath = Join-Path $projectRoot $LogFile
$outPath = Join-Path $projectRoot "logs\frontend-build.out.log"
$errPath = Join-Path $projectRoot "logs\frontend-build.err.log"

if (-not (Test-Path (Join-Path $projectRoot "logs"))) {
  New-Item -ItemType Directory -Path (Join-Path $projectRoot "logs") | Out-Null
}

"[$(Get-Date)] Frontend build started with timeout ${TimeoutSeconds}s" | Add-Content -Path $logPath

$process = Start-Process `
  -FilePath "cmd.exe" `
  -ArgumentList @("/c", "pnpm --dir frontend build") `
  -WorkingDirectory $projectRoot `
  -RedirectStandardOutput $outPath `
  -RedirectStandardError $errPath `
  -WindowStyle Hidden `
  -PassThru

$startedAt = Get-Date
while (-not $process.HasExited) {
  Start-Sleep -Seconds 2
  Write-Host "." -NoNewline
  if (((Get-Date) - $startedAt).TotalSeconds -ge $TimeoutSeconds) {
    Write-Host ""
    "[$(Get-Date)] Frontend build timed out after ${TimeoutSeconds}s. PID=$($process.Id)" | Add-Content -Path $logPath
    taskkill /PID $process.Id /T /F | Out-Null
    Get-Content $outPath -ErrorAction SilentlyContinue | Add-Content -Path $logPath
    Get-Content $errPath -ErrorAction SilentlyContinue | Add-Content -Path $logPath
    exit 124
  }
  $process.Refresh()
}

Write-Host ""
Get-Content $outPath -ErrorAction SilentlyContinue | Add-Content -Path $logPath
Get-Content $errPath -ErrorAction SilentlyContinue | Add-Content -Path $logPath

if ($process.ExitCode -ne 0) {
  "[$(Get-Date)] Frontend build failed with exit code $($process.ExitCode)" | Add-Content -Path $logPath
  exit $process.ExitCode
}

"[$(Get-Date)] Frontend build completed successfully" | Add-Content -Path $logPath
exit 0
