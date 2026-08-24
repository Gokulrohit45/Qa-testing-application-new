import re
import time
from utils.logger import logger

# Graceful optional type-hint imports for Playwright
try:
    from playwright.sync_api import Page, ElementHandle
except ImportError:
    Page = object
    ElementHandle = object

def smart_fill(page, target: str, value: str, timeout: int = 6000) -> bool:
    """
    Intelligently attempts to find an input element by placeholder, label, type, name, ID, aria-label,
    or CSS selector, clear existing content, focus, and fill/type the value.
    """
    t_lower = target.lower().strip()
    val_str = str(value)

    # 1. Custom Strategy Building based on target text
    selectors = []

    # If target mentions email
    if "email" in t_lower or "mail" in t_lower or "user" in t_lower:
        selectors.extend([
            "input[type='email']",
            "input[name*='email' i]",
            "input[id*='email' i]",
            "input[placeholder*='email' i]",
            "input[placeholder*='address' i]",
            "input[aria-label*='email' i]",
        ])

    # If target mentions password
    if "pass" in t_lower or "pwd text" in t_lower or "secret" in t_lower:
        selectors.extend([
            "input[type='password']",
            "input[name*='pass' i]",
            "input[id*='pass' i]",
            "input[placeholder*='pass' i]",
            "input[aria-label*='pass' i]",
        ])

    # Standard fuzzy selectors
    selectors.extend([
        f"input[name='{target}']",
        f"input[id='{target}']",
        f"input[placeholder*='{target}' i]",
        f"input[aria-label*='{target}' i]",
        f"textarea[name='{target}']",
        f"textarea[placeholder*='{target}' i]",
        f"text='{target}' >> xpath=..//input",
        f"label:has-text('{target}') >> input",
        f"text={target} >> .. >> input",
        target # Raw selector fallback
    ])

    # Fallback to first or second input if target matches common login patterns
    if "email" in t_lower or "user" in t_lower:
        selectors.append("input:not([type='hidden']):not([type='submit'])")
    elif "pass" in t_lower:
        selectors.append("input[type='password'], input:not([type='hidden']):nth-of-type(2)")

    # Deduplicate selectors list while keeping order
    unique_selectors = list(dict.fromkeys(selectors))
    attempt_timeout = max(200, min(1200, timeout // max(1, len(unique_selectors))))

    for sel in unique_selectors:
        try:
            elem = page.wait_for_selector(sel, timeout=attempt_timeout, state="visible")
            if elem:
                elem.scroll_into_view_if_needed()
                elem.click()
                elem.fill(val_str)
                try:
                    page.evaluate("""(el) => {
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }""", elem)
                except Exception:
                    pass
                logger.info(f"smart_fill succeeded with selector: '{sel}'")
                return True
        except Exception as e:
            continue

    # Final attempt: generic page fill
    try:
        page.fill(target, val_str, timeout=2000)
        logger.info(f"smart_fill fallback page.fill succeeded for target '{target}'")
        return True
    except Exception as e:
        logger.error(f"smart_fill failed to find input matching target '{target}': {e}")
        raise RuntimeError(f"Could not locate input field matching '{target}'")


def smart_click(page, target: str, timeout: int = 6000) -> bool:
    """
    Intelligently attempts to click a button, link, submit input, or interactive element.
    """
    target = str(target or "").strip()
    t_lower = target.lower()
    if not target:
        raise RuntimeError("Click target is empty")
    if target in {"+", "-", "..."}:
        raise RuntimeError(
            f"Ambiguous click target '{target}'. Use the control's accessible name or describe its purpose."
        )

    # A click gets one shared budget. Individual selector and click attempts must
    # never inherit the page's much larger default timeout.
    budget_ms = max(2500, min(int(timeout or 8000), 10000))
    deadline = time.monotonic() + (budget_ms / 1000)
    last_error = None
    blocker = None

    def remaining(cap=1200, floor=100):
        return max(floor, min(cap, int((deadline - time.monotonic()) * 1000)))

    def describe_blocker(elem):
        try:
            return page.evaluate("""(el) => {
                const r = el.getBoundingClientRect();
                const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                if (!top || top === el || el.contains(top)) return null;
                return {
                    tag: top.tagName.toLowerCase(),
                    text: (top.innerText || top.getAttribute('aria-label') || '').trim().slice(0, 80),
                    role: top.getAttribute('role') || '',
                    className: String(top.className || '').slice(0, 100)
                };
            }""", elem)
        except Exception:
            return None

    def click_element(elem):
        nonlocal blocker, last_error
        elem.scroll_into_view_if_needed(timeout=remaining(700))
        blocker = describe_blocker(elem)
        try:
            elem.click(timeout=remaining(1400))
            return True
        except Exception as exc:
            last_error = exc
            # Escape safely dismisses most menus/dialogs. Retry once with the
            # remaining shared budget instead of starting a new long timeout.
            try:
                page.keyboard.press("Escape")
                page.wait_for_timeout(120)
                elem.click(timeout=remaining(1200))
                return True
            except Exception as retry_exc:
                last_error = retry_exc
                return False

    # Target-specific selectors come first. Never use an unrelated generic
    # submit button for an arbitrary click command.
    selectors = [
        f"button:has-text('{target}')",
        f"button:has-text('{t_lower}')",
        f"input[type='submit'][value*='{target}' i]",
        f"button[aria-label*='{target}' i]",
        f"[role='button']:has-text('{target}')",
        f"a:has-text('{target}')",
        f"input[type='button'][value*='{target}' i]",
        f"#{target}",
        f".{target}",
        f"text='{target}'",
    ]

    # Only accept a raw selector when it actually resembles CSS/XPath. Plain
    # labels and symbols must not be interpreted as selectors.
    if re.match(r"^(#|\.|\[|//|xpath=|css=)", target) or any(ch in target for ch in [">", "[", "]"]):
        selectors.append(target)

    if "sign in" in t_lower or "login" in t_lower or "submit" in t_lower:
        selectors.insert(0, "button[type='submit']")
        selectors.insert(1, "input[type='submit']")
        selectors.insert(2, "button:has-text('Sign In')")
        selectors.insert(3, "button:has-text('Sign in')")
        selectors.insert(4, "button:has-text('Login')")

    unique_selectors = list(dict.fromkeys(selectors))
    attempt_timeout = max(150, min(650, budget_ms // max(1, len(unique_selectors) + 3)))

    for sel in unique_selectors:
        if time.monotonic() >= deadline:
            break
        try:
            elem = page.wait_for_selector(sel, timeout=min(attempt_timeout, remaining(650)), state="visible")
            if elem:
                if click_element(elem):
                    logger.info(f"smart_click succeeded with selector: '{sel}'")
                    return True
        except Exception as e:
            last_error = e
            continue

    # Accessible-name and text fallbacks also handle clickable parent cards.
    for locator in [
        page.get_by_role("button", name=target, exact=False),
        page.get_by_role("link", name=target, exact=False),
        page.get_by_text(target, exact=False)
    ]:
        if time.monotonic() >= deadline:
            break
        try:
            elem = locator.first
            elem.wait_for(state="visible", timeout=remaining(700))
            if click_element(elem):
                logger.info(f"smart_click succeeded with accessible target '{target}'")
                return True
        except Exception as exc:
            last_error = exc
            try:
                parent = locator.first.locator("xpath=ancestor-or-self::*[@role='button' or self::button or self::a or @onclick][1]")
                parent.wait_for(state="visible", timeout=remaining(400))
                if click_element(parent):
                    logger.info(f"smart_click succeeded with clickable parent for '{target}'")
                    return True
            except Exception as parent_exc:
                last_error = parent_exc
                continue

    blocker_text = ""
    if blocker:
        label = blocker.get("text") or blocker.get("role") or blocker.get("className") or blocker.get("tag")
        blocker_text = f" The element was blocked by an overlay or element: {label}."
    detail = str(last_error or "No visible matching element was found").splitlines()[0]
    logger.error(f"smart_click failed for target '{target}': {detail}")
    raise RuntimeError(
        f"Could not click '{target}' within {budget_ms / 1000:.0f}s.{blocker_text} "
        f"Use a visible label, accessible role/name, or stable test ID."
    )
