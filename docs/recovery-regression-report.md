# Recovery and regression report — 5 September 2026

## Outcome

Recovered `frontend/src/pages/projects/DesktopWorkspace.jsx` from an entirely null-filled, untracked file by replaying its recorded creation and ordered source patches. The original 18,340 corrupt bytes and recovered checkpoint are preserved in `.test-results/recovery/`. No existing tracked changes or unrelated untracked files were reset or removed.

Completed the interrupted multiple named suite UI integration and matching browser fixture. Suite name, ordered membership and failure policy persist independently. Saved suite execution uses its server-loaded ID. Unsaved suite edits and edited member tests block execution; switching/editing resets authorization and switching away from an edited saved suite requires confirmation. Existing local test saving, history and report downloads remain.

## Verification

| Check | Result |
| --- | --- |
| Complete backend suite, including real Chromium contracts | 82 passed |
| Frontend unit and real service-module contracts | 22 passed |
| Chromium frontend integration scenarios | 5 passed |
| Standard production and packaged frontend builds | Passed |
| Fresh PyInstaller engine build | Passed |
| Frozen engine startup, capabilities, authentication and cleanup | Passed |
| Frozen engine real headless and visible browser assertions | Both passed |
| Preview NSIS installer build with `--publish never` | Passed |
| Archive identity/version, 8 current UI/Electron files, engine SHA-256, both browser runtimes, executable and filename exclusions | Passed |
| Real assertions using engine and browsers from `win-unpacked/resources` | Headless and visible passed |
| Source corruption scan | 90 source files checked; zero null-byte files |
| Git whitespace check | Passed |

Total unit/integration tests: **109 passed**, plus builds and executable/package checks above. The expanded desktop browser scenario exercises two suites, independent failure policies, restart persistence, renaming, declined discard, authorization invalidation, unsaved-run prevention and the saved-suite request ID.

The initial service-contract invocation omitted Node's required VM-module flag; the corrected `node --experimental-vm-modules --test src/lib/*.test.js tests/service-contract.test.cjs` invocation passed all 22 tests. The first installer verification exposed missing full Chromium: the existing package contained only headless Chromium despite the UI offering visible mode. Installed matching Chromium into `.test-browsers`, added a packaging guard requiring both modes, rebuilt, and passed real execution using both packaged modes. Checker path handling was also corrected for Windows ASAR paths.

## Evidence and reproduction

Logs are in `.test-results/recovery/`: `backend.log`, `browser.log`, `frozen-build.log`, `installer-build.log`, `packaged-engine.log`, `installer-check.log`.

Backend: set `PLAYWRIGHT_BROWSERS_PATH` to this workspace's `.test-browsers`, then run `.test-venv/Scripts/python.exe -m unittest discover -s backend/tests -v`.

Frontend: from `frontend`, run `node --experimental-vm-modules --test src/lib/*.test.js tests/service-contract.test.cjs` and `npm.cmd run build`. Browser UI tests use `npm.cmd run test:ui:server -- --strictPort`, then from the root run `.test-venv/Scripts/python.exe -m unittest discover -s frontend/tests -p 'test*.py' -v` with the same browser path. The fixture server was stopped after validation.

See `docs/version2-preview-installer.md` for packaging and executable checks. The reusable checker is `scripts/check-preview-installer.cjs`; `scripts/check-frozen-engine.py --browsers <directory>` now also verifies both browser modes using a temporary local HTTP fixture and temporary engine data.

## Release hold

**No push, deployment, installation or release was performed.** These are local automated regressions and packaging checks, not a complete installer lifecycle certification. Clean-machine installation, upgrade/uninstall, sign-in and integrated native desktop suite acceptance have not been run in this task. Those require a suitable disposable Windows acceptance environment and remain release gates. Version 2 still has other unfinished features documented in its implementation status.

Known build warnings remain: large frontend bundle; preview installer uses the default icon and lacks package author/description metadata. Signing and public release approval remain pending.

## Artifact hashes

- Preview installer: `.test-results\installer-v2\QA-AI-Platform-Preview-2.0.0-beta.1-x64.exe`; SHA-256 `8bf9b9b468d47568e00ff268b3e75271a7cfa012b7e27bb68a00c635971096b5`.
- Frozen engine: `.test-results\frozen-v2\qa-ai-engine.exe`; SHA-256 `9db29cc32fa8caf23180ff9ac149f984f66ab7b8e603b16747eb3ed834a0fb2e`.
