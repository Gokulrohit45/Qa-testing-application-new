from utils.logger import logger

# Graceful optional type-hint imports for Playwright
try:
    from playwright.sync_api import Page, ElementHandle
except ImportError:
    Page = object
    ElementHandle = object

def smart_fill(page, target: str, value: str, timeout: int = 5000) -> bool:
    """
    Intelligently attempts to find an input element by placeholder, label, name, ID, aria-label, or CSS selector
    and fill it with value.
    """
    selectors = [
        f"input[name='{target}']",
        f"input[id='{target}']",
        f"input[placeholder*='{target}' i]",
        f"input[aria-label*='{target}' i]",
        f"textarea[name='{target}']",
        f"textarea[placeholder*='{target}' i]",
        f"text={target} >> xpath=..//input",
        f"label:has-text('{target}') >> input",
        target # Raw selector if provided
    ]

    for sel in selectors:
        try:
            elem = page.wait_for_selector(sel, timeout=1000, state="visible")
            if elem:
                elem.fill(str(value))
                logger.info(f"smart_fill succeeded with selector: {sel}")
                return True
        except Exception:
            continue

    # Fallback to focused element or generic input fill
    try:
        page.fill(target, str(value), timeout=timeout)
        return True
    except Exception as e:
        logger.error(f"smart_fill failed for target '{target}': {e}")
        return False


def smart_click(page, target: str, timeout: int = 5000) -> bool:
    """
    Intelligently attempts to click a button, link, or element by text, role, ARIA label, ID, or selector.
    """
    selectors = [
        f"button:has-text('{target}')",
        f"a:has-text('{target}')",
        f"input[type='submit'][value*='{target}' i]",
        f"button[aria-label*='{target}' i]",
        f"[role='button']:has-text('{target}')",
        f"#{target}",
        f".{target}",
        f"text='{target}'",
        target # Raw selector
    ]

    for sel in selectors:
        try:
            elem = page.wait_for_selector(sel, timeout=1000, state="visible")
            if elem:
                elem.click()
                logger.info(f"smart_click succeeded with selector: {sel}")
                return True
        except Exception:
            continue

    try:
        page.click(target, timeout=timeout)
        return True
    except Exception as e:
        logger.error(f"smart_click failed for target '{target}': {e}")
        return False
