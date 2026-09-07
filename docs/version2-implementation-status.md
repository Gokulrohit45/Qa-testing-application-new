# Version 2 implementation status

## Startup fix — Preview 2.0.0-beta.2 — 5 September 2026

Fixed the first-install cloud configuration timeout reported by the user. Electron now reads verified bundled public-only sign-in settings before attempting a network fallback. Invalid caches fall back to the bundle, cache write errors do not abort startup, network fallback has a total deadline, and packaging rejects missing/invalid public configuration. No privileged key is bundled and explicit staging configuration still takes precedence.

Actual packaged Electron launch testing also exposed orphaned frozen-engine workers during shutdown. Shutdown now terminates the Windows process tree before its root exits. Fresh-profile and corrupt-cache launches both reached the sign-in screen offline and shut down successfully. Profile isolation preserved existing installed data.

Validation: 82 backend tests, 31 frontend/service/startup tests, five Chromium UI tests, production build, actual packaged Electron startup/shutdown in two scenarios, and packaged headless/visible browser assertions passed. Preview beta.2 replaces the earlier beta.1 installer for testing. See `docs/startup-fix-beta2.md` for final artifact verification. No push, hosted deployment or public release was performed.

## Recovery and multiple-suite integration — 5 September 2026

`DesktopWorkspace.jsx` was reconstructed from the original source creation and ordered patches after all 18,340 bytes were replaced with nulls. The corrupted bytes and recovered checkpoint are retained under `.test-results/recovery/`. Existing backend, frontend, media and other workspace changes were preserved.

Multiple named desktop suites now load, create, save, rename and switch independently, retaining membership order and failure policy. Switching with unsaved membership/name/policy changes asks before discarding them. Suite execution sends the saved suite ID; unsaved suite edits or edited member tests block execution until saved. Edits and switching invalidate window authorization. Reporting downloads and prior test-library, history, window inspection and step-authoring functionality remain.

Current source validation: 82 backend tests, 22 frontend unit/service-contract tests and five Chromium UI tests passed. Browser coverage now includes two named suites, restart persistence, independent failure policies, renaming, declined discard, authorization reset and saved-ID execution. Standard and packaged frontend builds passed with the existing large-bundle warning. Fresh frozen-engine startup/capability/authentication/cleanup checks passed. No remaining null bytes were found in 90 scanned source files.

Installer packaging verification is recorded in `docs/recovery-regression-report.md`. Clean installation, upgrade, uninstall, native suite acceptance and signing remain separate release gates. No push, deployment or release is authorized by passing local automation alone.

## Current checkpoint — 4 September 2026 (supersedes historical notes below)

Desktop reporting increment: each history record now offers standalone printable HTML and JSON downloads. Reports retain all step statuses, suite outcomes, findings and recommendations; explicitly exclude step inputs, targets and window identity; and escape HTML content with a restrictive content policy. Assertion counts distinguish action-only runs. Nineteen frontend unit tests pass, including three report tests. The earlier preview installer does not yet contain this reporting increment and must be rebuilt before final acceptance.

Next integration increment: shared HTTP handling preserves default authentication headers, enforces deadlines even with caller cancellation, and clears timers after response-body completion or errors. Local-only desktop project update/delete paths no longer call cloud storage. Validation: 16 frontend unit tests and 3 real service-module contract tests passed. A separate preview installer configuration uses explicit package identity and version, and installer-wide process-name termination was removed. Packaged UI reads the actual Electron version. No cloud sync was enabled and no deployment was made by this increment.

Preview installer build completed: `.test-results/installer-v2/QA-AI-Platform-Preview-2.0.0-beta.1-x64.exe`. Five browser UI checks passed again; app.asar metadata confirms separate preview identity/version; packaged engine SHA-256 matches the previously validated executable. This installer has not been installed or native-tested and is not a completed Version 2 release.

Latest verified increment: Windows account-bound DPAPI protection for saved desktop steps, legacy read compatibility and safe failed-save handling. Real Windows protection round trip and 40 desktop tests passed outside the restricted sandbox. Complete backend regression: 79 passed; frontend unit tests: 12 passed; production frontend build passed with the existing bundle-size warning. Monitoring errors now terminate with a failed outcome rather than leaving a run marked running.

Packaging checkpoint: fresh Windows executable built to `.test-results/frozen-v2/qa-ai-engine.exe`. Isolated executable check passed startup, web-module availability, desktop capability, rejection of unauthenticated local requests and cleanup. Five browser UI tests passed. This is not an installer, a native UIA worker acceptance test, or a completed Version 2 release. The previous `.build-venv` references a missing Python installation; the build used `.test-venv` with pinned PyInstaller 6.15.0 instead. Early multiprocessing freeze support was corrected and the spec is no longer excluded from source control.

Hosted development change: migration 002 was applied to Supabase project vedcjesnnfdaxrborqtj after a rollback trial. Existing four projects remained web projects in the trial. Verified project_type is non-null with web default and app_url is nullable. Existing ownership policies were inspected and not modified. Render remains on its previously deployed version; no code push or release has occurred. Desktop cloud synchronization remains disabled.

Implemented locally: web contract/import/assertion improvements; opt-in isolated Windows runner; window inspection; text entry and exact verification; visible/enabled/checked assertions; compatible checkbox, selection and expand/collapse actions; cancellation and diagnostics; local saved desktop test and run history.

User confirmed in Notepad: positive verification, negative verification, cancellation, saved steps after restart and history after restart. This is evidence for Notepad, not every Windows application.

Latest UI work: overview counts, readiness guidance, local date formatting, history status filters, step reordering, authorization invalidation after edits, initial-load protection and scoped contrast/focus improvements. No existing web routes were removed.

Outstanding implementation, not merely acceptance testing:
- Additional named suites per project (one reusable ordered suite per project is implemented).
- Recorder and reviewed video-to-test drafts.
- Secure test-data/credential storage and stronger desktop ownership/device binding.
- Future/dynamic control authoring, wider application compatibility and full reports.
- Production packaging integration and backwards-compatible cloud desktop sync.

Outstanding external acceptance: second desktop application, complete integrated UI/user flows, PostgreSQL staging migration, clean Windows installation/upgrade, signing credentials and release approval.

Except for the additive hosted schema change above, code changes remain local. Do not describe Version 2 as complete or enable desktop cloud sync based on this checkpoint. Historical test counts and pending items below describe earlier increments only.

### Named desktop test library

Reusable suite checkpoint: saved member order and continue/stop policy survive restart, with server-side membership/count checks. Authorization and window handles are never saved in the suite. Engine packaging now includes desktop requirements and pywinauto/comtypes discovery and resolves its source paths relative to the spec. A frozen-engine build, installer, hosted migration and hosted deployment have NOT been executed at this checkpoint.

Latest increment: ordered ad-hoc desktop suites use server-loaded saved tests, maximum 20 tests / 100 steps, shared selected window, stop-on-failure default and explicit continue policy. Suite results are retained in local run history. No automatic app reset or implicit setup. Native suite cancellation/flow acceptance remains pending. Explicit Electron staging configuration rejects missing settings and the known production backend; provisioning and independent backend isolation remain required. Ordinary preview mode still uses its existing cloud configuration.

Multiple named tests can now be created, selected, renamed and saved in one project. Legacy project-keyed tests remain intact and appear as Saved desktop test. Switching prompts before discarding edited steps and resets authorization; saved tests with edits must be saved before execution. New run history includes server-validated test ID/name; old history is preserved. Cross-project test overwrites and execution references are rejected. Values remain local and unencrypted; credential hardening is still pending.

Validation: 34 desktop backend tests, browser save/reload/rename/switch checks and production frontend build passed. The existing bundle-size warning remains. No native interaction, cloud change, push or release was performed in this increment.

## Database: wait before applying

`migrations/002_v2_project_foundation.sql` is a draft, not a production instruction.
It adds a web/desktop project type and allows a desktop project without a fake URL.
Existing projects default to web. No existing records or RLS policies are deleted.
The migration has not yet been executed against PostgreSQL or the deployed schema.

Before rollout: back up the database, inspect the live schema, apply to staging,
verify existing and new clients, and confirm ownership policies. Deploy compatible
backend/client code before enabling desktop project creation. Old clients must not
receive desktop projects until compatibility handling is implemented.

## Implemented foundation

- Local project validation defaults legacy projects to web.
- Desktop metadata can be represented without a URL.
- Health advertises actual capabilities; desktop execution remains disabled.
- Execution rejects desktop projects instead of sending them to Playwright.
- Unit coverage for project metadata and legacy defaults.
- Experimental isolated Windows adapter and user-run Notepad pilot added.
  Six desktop logic tests pass; the interactive Windows pilot is not yet verified.
  See `docs/desktop-pilot.md`. The local API is opt-in, disabled by default.

## Remaining

- Local device binding, Windows inspection and execution adapter.
- Shared desktop actions/assertions and safe stop/recovery.
- Cloud schema staging validation and project sync compatibility.
- Professional web/desktop UI and complete regression coverage.
- Recording and reviewed video drafts.
- Installer hardening, signing setup, clean-machine and upgrade acceptance.

No production DB changes, push, deployment, or release has been performed.

## Local UI integration increment

- Web/Desktop project selection and local-only desktop project creation.
- Running-window discovery, control inspection, draft steps, Run/Stop and results.
- Process watchdog and local-token/Windows/explicit-enable gates.
- Desktop jobs are isolated from the existing web execution endpoint.
- Remaining: durable test/results storage, EXE launch, shared report/history,
  interactive UI acceptance, cloud migrations, packaging and recorder features.

Validation for this increment: 58 backend tests, 10 frontend unit tests, four
existing web UI tests and one new desktop UI test passed. Desktop UI tests mock
the Windows service and do not certify native UIA interaction. Production frontend
build passed with the existing approximately 1.55 MB JavaScript bundle warning.
Light-mode preview was visually checked and a text contrast defect corrected.

## Failure and Stop increment

- Text mismatches and unavailable controls now have distinct safe diagnostic codes
  and recommendations; editor contents are not included in diagnostics.
- Stop exposes a stopping state until worker cleanup finishes. Completed results
  stay intact; unreported steps are marked not_completed rather than passed.
- Inspection completion is labelled separately from a test pass in the UI.
- 23 desktop logic/API tests pass, including four new failure/Stop tests.
- Real user-run Stop and negative-assertion acceptance remain pending.

## Foundation validation

38 backend tests passed, including five new project-contract tests. After adding
the desktop execution guard integration test, all seven API tests passed on a
separate rerun. One intermediate API invocation omitted PLAYWRIGHT_BROWSERS_PATH
and failed to find Chromium; rerunning with the documented isolated browser path
passed. PostgreSQL migration execution and Windows desktop execution remain untested.
