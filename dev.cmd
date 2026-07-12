@echo off
setlocal
cd /d "%~dp0"

set PORT=5173

where npm >nul 2>&1
if errorlevel 1 (
    echo npm not found. Install Node.js from https://nodejs.org/
    exit /b 1
)

echo Checking for existing dev server on port %PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
    echo Stopping process %%a...
    taskkill /PID %%a /F >nul 2>&1
)
ping 127.0.0.1 -n 2 >nul

if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 exit /b 1
)

echo Starting dev server at http://127.0.0.1:%PORT%/
call npm run dev