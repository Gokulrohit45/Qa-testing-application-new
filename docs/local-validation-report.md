# Local validation report — 4 September 2026

## Scope and release status

Implemented locally: structured test imports, guided authoring, deterministic command parsing, optional validated AI conversion, explicit outcomes, preflight checks, runtime variables, bounded locator/action waits, declared dependencies, and evidence-based reporting.

No code was pushed, no release was published, no production migration was run, and no production application data was changed during verification. Existing user videos, presentations and unrelated untracked files were preserved. This is a local implementation and regression-test result, **not a certification that every application will pass**.

## Results

| Check | Result |
| --- | --- |
| Backend/API/parser/translation-validator and real Chromium engine suite | 33 passed |
| Frontend CSV and report-summary unit tests | 10 passed |
| Real Chromium frontend UI tests using mock services | 4 passed |
| Frontend production build | Passed |
| Whitespace/diff validation | Passed; Git reports expected LF-to-CRLF conversion warnings |
| Structured import screenshot inspection | Reviewed; builder, expectation fields and upload guidance visible |

Total: **47 automated tests passed**. The build has a bundle-size warning: the main JavaScript chunk is about 1.55 MB before compression. That warning is not a build failure and was not hidden.

## What was exercised

- CSV escaping, quoted multiline fields, BOM, grouping, step numbering, exact values and unknown expectation-column rejection.
- Legacy upload repair, command-keyword collisions (such as “verify Open incidents”), unsupported commands and explicit wait units.
- Local translation without AI; rejecting dropped/rewritten AI steps, invalid navigation, hardware instructions and incompatible cloud suggestions.
- Visible-text assertions (hidden HTML cannot pass), URL/field/option/element conditions, native select controls and delayed content.
- Duplicate controls rejected, disabled controls bounded by timeout, file input upload and redaction of password/runtime data from diagnostic logs.
- Action succeeds but assertion fails; dependent steps blocked while independent steps continue; critical failure blocks remaining steps.
- First navigation assertion preserved, with no duplicated result on a single failed navigation step.
- CSV import/save preserves action and expectation without invoking AI; guided add/edit; runtime values reach execution without changing saved placeholders.
- Empty/incomplete/stopped runs do not acquire a passing report summary. Action-only runs are distinguished from outcome-checked runs.

The UI harness replaces cloud/project/execution services and blocks external browser requests. Backend browser tests use a local HTTP fixture and isolated temporary application storage. These fixtures do not reproduce every behavior of VTAB Sentinel or AnalyticCore.

## Reproducing the checks

The isolated environment created for this workspace is `.test-venv`; matching Chromium binaries are in `.test-browsers`. Both are ignored by Git. Existing broken Python virtual environments were not overwritten.

From the repository root in PowerShell:

```powershell
$env:PYTHONIOENCODING = 'utf-8'
$env:PLAYWRIGHT_BROWSERS_PATH = 'D:\Testing-application-new\.test-browsers'
.\.test-venv\Scripts\python.exe -m unittest discover -s backend/tests -v
```

From `frontend`, run `npm test` and `npm run build`. For UI checks, start `npm run test:ui:server` from `frontend`, then run the following from the repository root in another terminal:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = 'D:\Testing-application-new\.test-browsers'
.\.test-venv\Scripts\python.exe frontend/tests/test_ui.py -v
```

The UI screenshot is written to `.test-results/structured-import.png`. Stop the fixture server after testing. The fixture server was stopped at handoff.

## Still required before release

1. **Live AI integration:** validate with the intended configured `GEMINI_MODEL` and API key. The real Gemini service was not called. Existing cloud code must be updated deliberately before accepting contract_version 2 responses; this local task did not deploy it.
2. **Application acceptance testing:** run reviewed, non-destructive scenarios against the intended VTAB Sentinel/AnalyticCore test environments. Native selects are supported; custom menus need explicit steps. Frames, new windows, CAPTCHA, hardware and dedicated API integrations are not newly implemented by this update.
3. **Packaged desktop testing:** rebuild and verify the Windows installer and installed engine, including clean install/update, asset restore and face-video flows on another device. The current source build is not an installer-validation result.

Browser traffic diagnostics are not proof of internal backend OpenTelemetry coverage. Genuine backend tracing still requires instrumentation and correlated trace data from the target services. Screenshots and target responses may contain private information even when step data is redacted; review them before sharing.

See [the authoring guide](testing-guide.md) for the user-facing format and supported behavior.
