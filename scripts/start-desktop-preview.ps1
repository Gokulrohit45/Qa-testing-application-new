param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$PreviewRoot = Split-Path -Parent $PSScriptRoot
$PreviewPython = Join-Path $PreviewRoot '.test-venv\Scripts\python.exe'
$PreviewFrontend = Join-Path $PreviewRoot 'frontend'
if (-not (Test-Path -LiteralPath $PreviewPython)) { throw 'Preview Python is missing. Ask for environment setup before continuing.' }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Node.js/npm is required for the source preview.' }
foreach ($PreviewTool in @('electron\dist\electron.exe', 'vite\bin\vite.js', 'concurrently\dist\bin\concurrently.js', 'wait-on\bin\wait-on')) {
    if (-not (Test-Path -LiteralPath (Join-Path $PreviewFrontend "node_modules\$PreviewTool"))) {
        throw "Frontend dependency missing: $PreviewTool. Run npm ci in the frontend folder first."
    }
}
& $PreviewPython -c "import importlib.util,sys; missing=[m for m in ('flask','flask_cors','dotenv','requests','playwright','pywinauto','win32gui','comtypes') if importlib.util.find_spec(m) is None]; print('Missing dependencies: '+', '.join(missing) if missing else 'Python dependency checks passed'); sys.exit(bool(missing))"
if ($LASTEXITCODE -ne 0) { throw 'Install the missing dependencies before starting the preview.' }
Write-Host 'Local desktop preview prerequisites passed.'
Write-Host 'The preview uses a separate local profile. Cloud sign-in still requires internet access.'
if ($CheckOnly) { return }

$PreviewEnv = @{
    QA_AI_PYTHON = $PreviewPython
    QA_AI_ENABLE_DESKTOP_RUNNER = '1'
    QA_AI_PREVIEW_DATA_DIR = (Join-Path $PreviewRoot '.desktop-preview')
    PLAYWRIGHT_BROWSERS_PATH = (Join-Path $PreviewRoot '.test-browsers')
}
$PreviousPreviewEnv = @{}
foreach ($PreviewKey in $PreviewEnv.Keys) {
    $PreviousPreviewEnv[$PreviewKey] = [Environment]::GetEnvironmentVariable($PreviewKey, 'Process')
    [Environment]::SetEnvironmentVariable($PreviewKey, $PreviewEnv[$PreviewKey], 'Process')
}
Push-Location $PreviewFrontend
try {
    Write-Host 'Opening the source preview. Keep this terminal open; close the preview app when finished.'
    & npm.cmd run electron:desktop-preview
    if ($LASTEXITCODE -ne 0) { throw 'Preview exited with an error. Share the terminal output; do not reinstall the application.' }
} finally {
    Pop-Location
    foreach ($PreviewKey in $PreviousPreviewEnv.Keys) {
        [Environment]::SetEnvironmentVariable($PreviewKey, $PreviousPreviewEnv[$PreviewKey], 'Process')
    }
}
