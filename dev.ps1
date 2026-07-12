# Start the Integral Studio dev server (Vite on http://127.0.0.1:5173/)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$Port = 5173

function Stop-ListenerOnPort {
    param([int]$TargetPort)

    $pids = @()
    $pattern = ":$TargetPort\s"

    if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
        $pids = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    } else {
        netstat -ano | Select-String $pattern | Select-String "LISTENING" | ForEach-Object {
            $parts = ($_ -split '\s+') | Where-Object { $_ }
            $parts[-1]
        } | ForEach-Object { [int]$_ } | Select-Object -Unique
    }

    foreach ($procId in $pids) {
        if ($procId -le 0) { continue }
        Write-Host "Stopping process $procId on port $TargetPort..."
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }

    if ($pids.Count -gt 0) {
        Start-Sleep -Milliseconds 500
    }
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm not found. Install Node.js from https://nodejs.org/"
    exit 1
}

Stop-ListenerOnPort -TargetPort $Port

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Starting dev server at http://127.0.0.1:$Port/"
npm run dev