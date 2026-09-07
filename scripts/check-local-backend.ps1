param([string]$Python = '')
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $Python) { $Python = Join-Path $repoRoot '.test-venv\Scripts\python.exe' }
if (-not (Test-Path -LiteralPath $Python)) { throw 'Test Python is missing. Prepare the project test environment first.' }
$browserRoot = Join-Path $repoRoot '.test-browsers'
if (-not (Test-Path -LiteralPath $browserRoot)) { throw 'Project test browsers are missing.' }
$previousBrowserPath = $env:PLAYWRIGHT_BROWSERS_PATH
$previousUtf8 = $env:PYTHONUTF8
try {
    $env:PLAYWRIGHT_BROWSERS_PATH = $browserRoot
    $env:PYTHONUTF8 = '1'
    Push-Location $repoRoot
    try {
        & $Python -m unittest discover -s backend/tests
        if ($LASTEXITCODE -ne 0) { throw 'Backend regression checks failed.' }
    } finally { Pop-Location }
} finally {
    $env:PLAYWRIGHT_BROWSERS_PATH = $previousBrowserPath
    $env:PYTHONUTF8 = $previousUtf8
}
