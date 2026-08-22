$ErrorActionPreference = 'Stop'
$RepositoryRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepositoryRoot 'backend'
$FrontendDir = Join-Path $RepositoryRoot 'frontend'
$BuildVenv = Join-Path $RepositoryRoot '.build-venv'

if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
    throw 'Python 3.11 or newer is required to create a release build.'
}

if (-not (Test-Path $BuildVenv)) { py -3 -m venv $BuildVenv }
$PythonExe = Join-Path $BuildVenv 'Scripts\python.exe'
$PipExe = Join-Path $BuildVenv 'Scripts\pip.exe'
& $PipExe install --upgrade pip
& $PipExe install -r (Join-Path $BackendDir 'requirements-engine.txt')

$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $BackendDir 'playwright-browsers'
& $PythonExe -m playwright install chromium
Push-Location $RepositoryRoot
try {
    & $PythonExe -m PyInstaller --noconfirm --clean --onefile --name qa-ai-engine --paths $BackendDir --collect-all playwright (Join-Path $BackendDir 'app.py')
    New-Item -ItemType Directory -Force (Join-Path $BackendDir 'dist') | Out-Null
    Copy-Item -Force (Join-Path $RepositoryRoot 'dist\qa-ai-engine.exe') (Join-Path $BackendDir 'dist\qa-ai-engine.exe')
} finally { Pop-Location }

Push-Location $FrontendDir
try {
    & npm.cmd ci
    & npm.cmd run electron:build
} finally { Pop-Location }
