import re
import time
from core.smart_selectors import resolve_target, candidates


class OutcomeError(RuntimeError):
    def __init__(self, expected_type, expected, observed):
        self.observed = observed
        super().__init__(f"Expected {expected_type}: {expected!r}; observed: {observed!r}")


def check_outcome(page, step, timeout):
    from playwright.sync_api import expect
    kind = step.get("expected_type") or "text_visible"
    value = str(step.get("expected_value", "")) if step.get("expected_type") else str(step.get("target", ""))
    target = step.get("expected_target") or step.get("target", "")
    deadline = time.monotonic() + max(1, timeout) / 1000
    observed = "Condition was not satisfied before the deadline"
    try:
        if kind in {"url_contains", "url_equals"}:
            expect(page).to_have_url(re.compile(re.escape(value)) if kind == "url_contains" else value, timeout=timeout)
            return page.url.split("?")[0]
        if kind == "text_visible":
            # Visibility assertion only. Hidden DOM/source text can never pass.
            locator = page.get_by_text(value, exact=False).filter(visible=True)
            expect(locator.first).to_be_visible(timeout=timeout)
            return "Expected text is visible"
        if kind == "element_hidden":
            locators = candidates(page, target)
            while any(locator.nth(i).is_visible() for locator in locators for i in range(locator.count())):
                if time.monotonic() >= deadline:
                    raise RuntimeError("Target is still visible")
                page.wait_for_timeout(min(50, max(1, (deadline-time.monotonic())*1000)))
            return "Target is hidden or absent"
        locator = resolve_target(page, target, timeout, "fill" if kind == "field_value" else "select" if kind == "selected_option" else "click")
        remaining = max(1, int((deadline - time.monotonic()) * 1000))
        if kind == "field_value":
            expect(locator).to_have_value(value, timeout=remaining)
        elif kind == "selected_option":
            expect(locator.locator("option:checked")).to_have_text(value, timeout=remaining)
        elif kind == "element_visible":
            expect(locator).to_be_visible(timeout=remaining)
        elif kind == "element_enabled":
            expect(locator).to_be_enabled(timeout=remaining)
        elif kind == "element_disabled":
            expect(locator).to_be_disabled(timeout=remaining)
        else:
            raise RuntimeError("Unsupported expected condition")
        return "Expected condition confirmed"
    except Exception:
        # Do not echo page text/input values: they may contain personal data or secrets.
        if kind.startswith("url_"):
            observed = page.url.split("?")[0]
        safe_value = "[REDACTED]" if kind == "field_value" or step.get("sensitive") else value
        raise OutcomeError(kind, safe_value, observed) from None
