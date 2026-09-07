# Experimental Windows desktop runner

The command-line Notepad pilot and a local-only desktop UI preview are available
in source. Neither is released in an installer. No database migration is needed.
Existing web execution remains separate.

## User-run Notepad check

Save and close all Notepad windows first. The pilot refuses existing Notepad
processes, creates a uniquely named file under `.test-results`, and leaves its
window open. Do not type or click during the test. Ctrl+C in the terminal stops
the worker; the watchdog stops it after 60 seconds. Neither action kills Notepad.

From the repository folder, with the existing isolated test Python environment:

```powershell
.\.test-venv\Scripts\python.exe -m pip install -r backend/requirements-desktop.txt
.\.test-venv\Scripts\python.exe scripts/notepad-pilot.py --confirm-interactive
```

The printed `result.json` path contains the result. A pass requires editor text
verification AND saved-file content verification. Newer Notepad control layouts
may fail safely and need an adapter adjustment. This pilot has not yet been
interactively verified on this machine.

## Current boundaries

- UI Automation via pywinauto; exact structured control matching, no coordinates.
- The Notepad-only pilot can type generated sample text into an empty, focused
  editor when ValuePattern is absent. It reads TextPattern for verification.
  This opt-in fallback is not enabled in the general Windows adapter.
- click (Invoke pattern), fill, and exact text verification only.
- Mutations are not automatically retried. A failed step blocks subsequent steps.
- Cooperative cancellation between provider calls; a process watchdog is required
  because Windows accessibility providers can hang inside a call.
- The opt-in local API provides process-isolated window discovery, control
  inspection, Run/Stop and streamed step results. Cloud execution is disabled.
- No recorder, screenshots, desktop CSV conversion, cross-device bindings or
  installer packaging in this increment. UI tests/results are in-memory drafts.
- No support claim for every Windows app, custom-rendered canvas, UAC or secure desktop.

References: https://pywinauto.readthedocs.io/en/latest/code/pywinauto.application.html
and https://pywinauto.readthedocs.io/en/latest/code/pywinauto.controls.uia_controls.html

## Application UI preview

From any PowerShell folder, launch the source preview using:

```powershell
& "D:\Testing-application-new\scripts\start-desktop-preview.ps1"
```

The launcher selects the verified test Python, enables the local preview flag,
and uses `.desktop-preview` for an isolated Electron profile and local database.
It does not migrate Supabase, install a release, or alter the installed app's
local profile. Sign in with your existing account, create a Windows desktop
project, and use a disposable document. Do not modify cloud web projects during
the preview: login still connects to your real account. Closing the preview
stops its development server. If port 5173 is occupied, close the other dev
server yourself; the launcher does not kill unrelated processes.

`-CheckOnly` checks prerequisites without opening Electron or Notepad. Those
checks and Electron syntax validation passed; interactive launch is user-run.

The local engine must have QA_AI_DESKTOP=1, a nonempty LOCAL_API_TOKEN, and
QA_AI_ENABLE_DESKTOP_RUNNER=1. The frontend must receive the matching local API
token through the existing Electron preload configuration. Dependencies from
requirements-desktop.txt must be installed in the engine environment (not merely
the separate test environment). Do not enable this on the cloud backend.

Create a Windows desktop project; it is saved only to the local engine and is
not uploaded to Supabase. Open a disposable target document manually, refresh
windows, select the exact window, inspect controls, build steps, confirm and run.
This preview attaches to running windows only; EXE launch is not implemented.
The frontend does not invoke the Notepad pilot's generated-text keyboard fallback.
Stop kills only the worker. It cannot undo actions already performed. Jobs have
a 20-second discovery budget and at most 300 seconds for execution. Provider
calls can exceed an individual step's budget until the process watchdog stops it.

The GUI path still requires interactive acceptance testing. Do not publish it as
production-ready or run database migrations based on mocked UI tests.
