# Preview beta.2 startup fix — 5 September 2026

## Fixed

- First-install startup no longer waits for the cloud public-configuration endpoint. The installer bundles only verified public anonymous/publishable client settings. Sign-in still requires connectivity and normal authentication.
- Missing/corrupt caches use the bundle. Cache-write failures no longer prevent startup. Network fallback has a total deadline, size limits, interrupted-response handling and public-key validation.
- Explicit staging settings retain precedence, with no production fallback in test mode.
- Closing the app terminates the Windows engine tree before its root exits, preventing orphaned frozen workers.
- The installer is version **2.0.0-beta.2**, preserving the Preview identity and local data. The older regular application remains separate.

## Passed verification

- 82 backend tests.
- 31 frontend, service and startup tests, including nine new public-configuration regressions.
- Five Chromium UI integration tests.
- Packaged frontend build and NSIS installer build (`--publish never`).
- Actual packaged Electron launch with fresh isolated local data: sign-in window visible offline, correct beta.2 version and bundled settings; no downloaded configuration cache created.
- Actual packaged Electron launch with a corrupt cache: same successful result; corrupt cache does not abort startup.
- Both application runs closed without orphaned engine processes.
- Packaged engine startup, web/desktop capability, local authentication and cleanup checks.
- Actual headless and visible Chromium assertions through the packaged engine.
- Installer archive identity/version, ten current UI/Electron files, validated public configuration, engine hash, both browser resources and executable/filename checks.
- Git whitespace validation.

**118 unit/integration tests passed**, plus the actual Electron startup/shutdown and package/executable checks above. The first actual-launch test exposed a test-harness assertion import mistake and the engine cleanup bug; both were corrected and both launch scenarios passed on the final build.

Logs and screenshots: `.test-results/recovery/startup-frontend.log`, `startup-backend.log`, `startup-browser.log`, `packaged-startup.log`, `startup-fresh.png`, `startup-corrupt-cache.png`, `startup-packaged-engine.log`, `startup-installer-build.log`, and `startup-installer-check.log`.

## Installer

`.test-results/installer-v2/QA-AI-Platform-Preview-2.0.0-beta.2-x64.exe`

SHA-256: `f38d7ef52f0cc3d112a0752991563568c2b0eda16b123eb669f6cba1ff1e9918`

Close the Preview application before running this installer. It uses the same Preview identity as beta.1. The regular old application can remain installed. Native clean-install/upgrade/uninstall acceptance and real account sign-in were not automated here; the launch tests used the actual packaged executable in isolated profiles without user credentials. No user data was reset, and no push, hosted deployment or public release occurred.

Known non-blocking build warnings remain: large frontend bundle, default installer icon and missing author/description metadata. This fixes the reported startup failure and the shutdown defect found during testing; it does not certify every unfinished Version 2 feature.
