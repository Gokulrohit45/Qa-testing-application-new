# Version 2 Preview installer

This is an internal development preview, not the completed Version 2 release.

## Isolation

- Installer identity: `com.qa.ai.platform.preview`.
- Package name: `qa-ai-platform-preview`; product name: `QA-AI Platform Preview`.
- Package version: `2.0.0-rc.1`.
- Uses a separate local application-data folder rather than the existing installed app's folder.
- Uses the existing hosted development authentication/backend by default. This is **local-data separation, not cloud isolation**.
- Desktop execution is enabled in this preview, but every run still requires selecting a window and confirming its actions.
- No installer command terminates all matching engine processes by name.

## Build

First build the frozen engine into `.test-results/frozen-v2/qa-ai-engine.exe` and run `scripts/check-frozen-engine.py` against it.
Install both Chromium runtimes with the matching test-environment Playwright version before packaging. Set `PLAYWRIGHT_BROWSERS_PATH` to the repository `.test-browsers` directory and run `.test-venv/Scripts/python.exe -m playwright install chromium`. The preview builder now rejects a browser directory containing only one mode.

Then, from frontend:

```powershell
npm.cmd run build -- --mode packaged
node node_modules/electron-builder/cli.js --win --x64 --config electron/preview-builder.cjs --publish never
```

The preview configuration packages the repository test browsers, not a user's global browser cache. It does not install or publish the resulting executable.

After building, from the repository root:

```powershell
node scripts/check-preview-installer.cjs
.\.test-venv\Scripts\python.exe scripts/check-frozen-engine.py .test-results/installer-v2/win-unpacked/resources/python_engine/qa-ai-engine.exe --browsers .test-results/installer-v2/win-unpacked/resources/playwright-browsers
```

These checks compare the packaged UI/Electron files with current source, verify preview identity/version and the engine hash, check both Chromium modes, and execute a local assertion in headless and visible browsers through the packaged engine. They use temporary engine data and do not install the application.

The rc.1 build includes verified anonymous/publishable sign-in configuration so a first launch does not depend on the cloud configuration service. Cached or bundled configuration is validated before use; private/service-role keys are rejected. Startup does not bypass sign-in or provide offline authentication.

For actual application startup checks, `node scripts/check-preview-startup.cjs` launches the packaged Preview in a new `.test-results/startup-profile-*` directory, verifies the login screen with fresh and corrupt configuration caches, and checks shutdown. The script uses the local bundled Playwright runtime.

## Validation and limits

Package metadata is inspected from app.asar to verify the separate name and version. Packaged file names are checked for accidentally included environment and service-account files. These checks do not replace a complete secret scan or installed acceptance.

Clean installation, launch, sign-in, full web flow, Notepad flow, failure/cancellation, restart persistence, upgrade and uninstall still require native acceptance. The installer is not code-signed; signing and public release remain separate gates. Do not disable Windows security protections to run it.

## Release-candidate features

This build includes desktop workspace synchronization with revision conflicts and encrypted local backups, a Windows-protected credential vault, browser recording drafts, video-to-test review drafts, named desktop suites, execution reporting and the Version 2 workspace interface. Cloud synchronization requires migration `003_desktop_cloud_workspaces.sql`; video analysis requires the updated Render backend with `GEMINI_MODEL=gemini-2.5-flash`.
