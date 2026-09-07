# QA-AI test authoring guide

## What this engine can verify

The engine executes browser UI actions and checks explicit observable outcomes. It does not infer every business requirement from clicks. Hardware, database, MQTT, service administration and arbitrary API operations need dedicated integrations; do not describe these operations as browser clicks unless an actual UI control performs them.

Start with a small login/navigation smoke test, then add independent functional scenarios. Use a test environment and test accounts. Avoid real destructive actions or real purchases.

## Recommended format

In Project → Upload, choose **New guided test**, or download the CSV sample. Structured CSV is imported directly and is not translated by Gemini. Review imported steps before saving. Excel workbooks must first be exported to CSV.

| Column | Meaning |
| --- | --- |
| Test Case | Groups rows into separate tests; optional |
| Step | Consecutive numbers starting at 1 within each test; optional |
| Action | goto, click, fill, wait, verify, upload_file, select |
| Target | Full URL, control label, visible text or explicit selector |
| Value | Input text, uploaded asset filename, option label, or wait seconds |
| Expected Type | A supported condition below; optional for individual steps |
| Expected Value | The expected text, URL, field value or option label |
| Expected Target | Control being checked; defaults to the action target |
| Critical | true blocks remaining steps after failure; false is the default |
| Depends On | Earlier step numbers separated by semicolons, such as 2;3 |

Action and Target headers are required. Unknown headers are rejected so a misspelled expectation column cannot silently disappear. Quote CSV fields containing commas, newlines or quotes; an embedded quote is doubled. The legacy Value/Exp input column remains supported, but it is not a free-form assertion column.

Example:

```csv
Test Case,Step,Action,Target,Value,Expected Type,Expected Value,Expected Target,Critical,Depends On
Login,1,goto,https://example.com/login,,text_visible,Sign In,,true,
Login,2,fill,Email address,{{test_email}},,,,false,1
Login,3,fill,Password,{{test_password}},,,,false,1
Login,4,click,Sign In,,text_visible,Overview,,true,2;3
```

Replace the example URL and labels with those of the application under test. Supply runtime variables in Run Suite; values are not written back into the saved definition. Do not put real passwords in shared test files. Runtime-variable and password-field values are redacted in step logs, but screenshots and target-application responses can still contain sensitive data: review evidence before sharing it.

## Expected outcomes

| Type | What is checked |
| --- | --- |
| text_visible | Expected text is visible, not merely present in hidden HTML |
| url_contains / url_equals | Current page URL |
| field_value | Actual input value at Expected Target |
| selected_option | Selected option label of a native select element |
| element_visible / element_hidden | Visibility of the target |
| element_enabled / element_disabled | Enabled state of the target |

`verify` checks that Target text is visible. A click can complete successfully while its business outcome fails. Reports distinguish action execution from assertion results. A test with no verification conditions receives an action-only warning; it cannot prove functional correctness. Expected checks should reflect requirements, not be weakened just to make the run green.

## Targets and dropdowns

Prefer stable accessible names. Explicit forms include `role:button:Sign In`, `label:Email address`, `placeholder:Search`, `testid:increase-font`, `text:Welcome` and `css:input[type='file']`.

The resolver rejects multiple visible matches rather than clicking an arbitrary first match. Bare `+`, `-` and `...` are rejected: use a named control or stable selector. Native HTML dropdowns use `select` with the desired option label in Value. A custom menu uses separate click steps. Do not assume an open menu closes after choosing a theme; add the appropriate close action and check the resulting state. The engine does not force-click through overlays or silently dismiss arbitrary dialogs.

## Uploads and timing

Upload the file under the same project's Project Assets first. Use the exact asset filename, including extension, as Value; use the actual file input as Target. Local machine paths should not be used as portable project assets.

CSV wait values are **seconds** (0–300). Structured JSON and the guided builder use **milliseconds** (0–300000), as labeled. Prefer outcome conditions to fixed waits where possible. Element lookup, action and assertion share the configured step timeout; retries do not each receive a fresh full timeout. Evidence capture has its own short limit. Navigation, explicit waits, browser startup and finalization can take longer than ordinary clicks.

## Plain text and Gemini

Supported commands are parsed deterministically, for example:

```text
goto https://example.com/login
fill Email address with example@example.com
click Sign In
verify text Overview
upload_file "file" using "sample.xlsx"
select Times New Roman from Font
wait 5 seconds
```

Use full HTTP/S URLs, not `goto Dashboard` or `login.html`. Use click for navigation controls. The upload `using` separator matters for plain text; CSV instead has separate Target and Value fields.

Unknown instructions are not silently converted into clicks. Optional Gemini conversion requires a configured API key/model and explicit review of its suggested steps. The validator rejects missing lines and changes to recognized commands. AI output is still a proposal, not proof that the target UI exists. A cloud translator must return contract_version 2 and pass local validation; older cloud responses are rejected rather than trusted.

## Failures, dependencies and diagnostics

Failed actions and failed assertions are recorded separately. Explicit dependents are blocked when their prerequisite fails; independent steps may continue. Critical failures block remaining steps. Navigation and upload failures are treated as critical because later steps normally require that page/file state. Skipped/blocked steps must not be counted as passed.

Inspect the first failure and its evidence before downstream failures. Browser HTTP errors identify observed requests, not the internal root cause of a backend service. Genuine backend OpenTelemetry requires service instrumentation, trace propagation and correlation; browser traffic alone does not establish backend health. Recommendations are investigation guidance, not automatically proven fixes.

## Local verification before release

Run backend tests, frontend unit tests, mock-service UI browser tests and the frontend build. Then validate representative flows against the intended test environments and validate the packaged desktop installer before release. A finite passing regression suite does not guarantee every application or test case will work.
