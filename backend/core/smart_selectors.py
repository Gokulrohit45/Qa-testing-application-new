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

    for sel in unique_selectors:
        try:
            elem = page.wait_for_selector(sel, timeout=1200, state="visible")
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
                logger.info(f"smart_fill succeeded with selector: '{sel}' for value: '{val_str}'")
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
        raise RuntimeError(f"Could not locate input field matching '{target}'. Checked selectors: {unique_selectors[:4]}")


def smart_click(page, target: str, timeout: int = 6000) -> bool:
    """
    Intelligently attempts to click a button, link, submit input, or interactive element.
    """
    t_lower = target.lower().strip()

    selectors = [
        f"button:has-text('{target}')",
        f"button:has-text('{t_lower}')",
        f"input[type='submit'][value*='{target}' i]",
        f"button[aria-label*='{target}' i]",
        f"[role='button']:has-text('{target}')",
        f"a:has-text('{target}')",
        f"input[type='button'][value*='{target}' i]",
        f"button[type='submit']",
        f"input[type='submit']",
        f"#{target}",
        f".{target}",
        f"text='{target}'",
        target # Raw selector
    ]

    if "sign in" in t_lower or "login" in t_lower or "submit" in t_lower:
        selectors.insert(0, "button[type='submit']")
        selectors.insert(1, "input[type='submit']")
        selectors.insert(2, "button:has-text('Sign In')")
        selectors.insert(3, "button:has-text('Sign in')")
        selectors.insert(4, "button:has-text('Login')")

    unique_selectors = list(dict.fromkeys(selectors))

    for sel in unique_selectors:
        try:
            elem = page.wait_for_selector(sel, timeout=1200, state="visible")
            if elem:
                elem.scroll_into_view_if_needed()
                elem.click(force=True)
                logger.info(f"smart_click succeeded with selector: '{sel}'")
                return True
        except Exception as e:
            continue

    try:
        page.click(target, timeout=2000, force=True)
        logger.info(f"smart_click fallback page.click succeeded for target '{target}'")
        return True
    except Exception as e:
        logger.error(f"smart_click failed for target '{target}': {e}")
        raise RuntimeError(f"Could not locate clickable element matching '{target}'")
