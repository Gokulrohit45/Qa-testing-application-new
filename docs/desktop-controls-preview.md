# Extended desktop controls — local preview

Available actions now include click, fill, verify_text, verify_visible, verify_enabled, verify_checked, check, uncheck, select, expand and collapse.

Select operates on an inspected selectable item, not on a text value entered beside a dropdown. Expand/collapse requires the target's Windows ExpandCollapse pattern. Checkbox actions require TogglePattern and refuse indeterminate controls; an already-correct checkbox is left unchanged. Unsupported controls fail without keyboard or coordinate fallback. Mutations are not blindly retried.

The builder only offers currently inspected visible targets. Open a menu/dropdown in the test application and inspect again to discover its items. This increment does not implement recording, future-target authoring, arbitrary keyboard shortcuts, custom-painted controls, or universal desktop compatibility. Verify exact text still requires readable ValuePattern/TextPattern content, not an accessible label.

Validation: 32 desktop backend tests passed, including six new control tests using mocked providers. Real application acceptance is still pending.

Next acceptance: restart the preview, open Windows Calculator, refresh/select/inspect it. First check a uniquely identified button with Verify visible and Verify enabled. Review discovered controls before building an arithmetic test; do not guess localized labels or output selectors.

Release gates still pending: second-application acceptance, broader control compatibility, security and persistence hardening, full web regression, cloud schema/backend staging compatibility, clean-machine installer and upgrade checks. No production database change or release is included.
