"""Bounded, unambiguous locator resolution. Never force-click or guess an input."""
import re
import time


def candidates(page, target, purpose="click"):
    target = str(target).strip()
    for prefix, factory in (
        ("css:", page.locator), ("testid:", page.get_by_test_id),
        ("label:", lambda text: page.get_by_label(text, exact=True)),
        ("text:", lambda text: page.get_by_text(text, exact=True)),
        ("placeholder:", lambda text: page.get_by_placeholder(text, exact=True)),
    ):
        if target.startswith(prefix):
            return [factory(target[len(prefix):])]
    if target.startswith("role:"):
        _, role, name = target.split(":", 2)
        return [page.get_by_role(role, name=name, exact=True)]
    if re.match(r"^(#|\.|\[|//|xpath=|css=)", target) or "[" in target:
        return [page.locator(target)]
    name = re.compile(r"^" + re.escape(target) + r"$", re.I)
    if purpose in {"fill", "select"}:
        result = [page.get_by_label(name), page.get_by_placeholder(name),
                  page.get_by_role("combobox" if purpose == "select" else "textbox", name=name)]
        # Conventional field types are only accepted when a unique visible field exists.
        if purpose == "fill" and target.lower() in {"email", "email address"}:
            result.append(page.locator("input[type=email]"))
        if purpose == "fill" and target.lower() in {"password", "passwd"}:
            result.append(page.locator("input[type=password]"))
        return result
    return [page.get_by_role("button", name=name), page.get_by_role("link", name=name),
            page.get_by_role("tab", name=name), page.get_by_text(name)]


def resolve_target(page, target, timeout=6000, purpose="click", visible=True):
    if not target:
        raise RuntimeError("Target is empty")
    if target in {"+", "-", "..."}:
        raise RuntimeError("Ambiguous symbol; use an accessible name or explicit testid:/css: target")
    deadline = time.monotonic() + max(1, timeout) / 1000
    options = candidates(page, target, purpose)
    while True:
        for locator in options:
            matches = [locator.nth(i) for i in range(locator.count())
                       if not visible or locator.nth(i).is_visible()]
            if len(matches) > 1:
                raise RuntimeError(f"Ambiguous target '{target}': {len(matches)} matching elements. Specify a unique role, label or test ID.")
            if matches:
                return matches[0]
        if time.monotonic() >= deadline:
            raise RuntimeError(f"No {'visible ' if visible else ''}element matches '{target}' within the step timeout")
        page.wait_for_timeout(min(50, max(1, (deadline - time.monotonic()) * 1000)))


def perform(page, target, value, timeout, operation):
    deadline = time.monotonic() + max(1, timeout) / 1000
    locator = resolve_target(page, target, timeout, operation)
    remaining = max(1, int((deadline - time.monotonic()) * 1000))
    try:
        if operation == "click":
            locator.click(timeout=remaining)
        elif operation == "fill":
            locator.fill(str(value), timeout=remaining)
        elif operation == "select":
            # Native select is not a click on an OS-rendered option menu.
            locator.select_option(label=str(value), timeout=remaining)
    except Exception as exc:
        detail = str(exc)
        if "intercepts pointer" in detail:
            raise RuntimeError(f"Target '{target}' is blocked by an overlay. Add an explicit dismissal step.") from None
        raise RuntimeError(f"Could not {operation} '{target}' within the remaining step budget; inspect the screenshot and control state.") from None
    return True


def smart_click(page, target, timeout=6000):
    return perform(page, target, "", timeout, "click")


def smart_fill(page, target, value, timeout=6000):
    return perform(page, target, value, timeout, "fill")


def smart_select(page, target, value, timeout=6000):
    return perform(page, target, value, timeout, "select")
