import json
import time
import uuid
import threading
from pathlib import Path
from config import SCREENSHOTS_DIR, EXECUTION_LOGS_DB_FILE, EXECUTIONS_DB_FILE
from core.virtual_webcam import get_chromium_camera_args
from core.smart_selectors import smart_fill, smart_click
from utils.logger import logger
from utils.local_store import get as store_get, upsert as store_upsert

# Graceful optional import for Playwright (Available on Desktop Engine, Optional on Cloud API)
try:
    from playwright.sync_api import sync_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    sync_playwright = None
    PLAYWRIGHT_AVAILABLE = False
    logger.info("Playwright module not found. Operating in Cloud API Backend mode.")

# In-memory logs store
EXECUTION_LOGS_CACHE = {}
EXECUTION_STATUS_CACHE = {}
CANCELLED_EXECUTIONS = set()
STORAGE_LOCK = threading.RLock()

def _is_sensitive_target(target):
    lowered = str(target).lower()
    return any(word in lowered for word in ("password", "passwd", "pwd", "secret", "token", "api key", "otp"))

def load_json_file(file_path, default=None):
    if default is None:
        default = []
    if not file_path.exists():
        return default
    try:
      with STORAGE_LOCK:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default

def save_json_file(file_path, data):
    try:
      with STORAGE_LOCK:
        temp_path = file_path.with_suffix(file_path.suffix + ".tmp")
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            f.flush()
        temp_path.replace(file_path)
    except Exception as e:
        logger.error(f"Error writing file {file_path}: {e}")

def update_disk_execution_logs(execution_id, logs, status="Finished", error_message=None, duration_ms=0):
    store_upsert("execution_logs", {"id": execution_id, "logs": logs})
    execution = store_get("execution", execution_id) or {
        "id": execution_id, "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")}
    execution.update({"status": status, "error_message": error_message, "duration_ms": duration_ms})
    store_upsert("execution", execution)

def run_playwright_test(execution_id: str, app_url: str, steps: list, face_auth_enabled: bool = False, y4m_path: str = None, headless: bool = True, timeout_seconds: int = 30):
    """
    Synchronously runs Playwright actions in background thread, emitting step logs and screenshots.
    If running on Cloud Server without Playwright, delegates execution to Desktop client.
    """
    if not PLAYWRIGHT_AVAILABLE:
        message = "Playwright is not installed in the local testing engine"
        EXECUTION_STATUS_CACHE[execution_id] = {"status": "Failed", "error_message": message, "duration_ms": 0}
        EXECUTION_LOGS_CACHE[execution_id] = []
        update_disk_execution_logs(execution_id, [], status="Failed", error_message=message)
        return

    logger.info(f"Starting Playwright execution {execution_id} for URL {app_url}")
    EXECUTION_STATUS_CACHE[execution_id] = {"status": "Running", "start_time": time.time()}
    EXECUTION_LOGS_CACHE[execution_id] = []

    start_time = time.time()
    logs = []
    has_error = False
    global_err_msg = None

    try:
        with sync_playwright() as p:
            camera_args = get_chromium_camera_args(y4m_path) if face_auth_enabled else []
            
            browser = p.chromium.launch(
                headless=headless,
                args=camera_args
            )
            
            context = browser.new_context(
                permissions=["camera", "microphone"] if face_auth_enabled else [],
                viewport={"width": 1280, "height": 720},
                ignore_https_errors=False
            )
            
            page = context.new_page()
            action_timeout = max(3, min(int(timeout_seconds), 300)) * 1000
            page.set_default_timeout(action_timeout)

            # Step 1: Default navigation to app_url if provided
            if app_url:
                step_start = time.time()
                step_num = 1
                screenshot_filename = f"exec_{execution_id}_step_{step_num}.png"
                screenshot_path = SCREENSHOTS_DIR / screenshot_filename
                
                try:
                    page.goto(app_url, wait_until="domcontentloaded", timeout=action_timeout)
                    page.screenshot(path=str(screenshot_path))
                    step_dur = int((time.time() - step_start) * 1000)
                    
                    log_item = {
                        "id": str(uuid.uuid4()),
                        "execution_id": execution_id,
                        "step_number": step_num,
                        "action": "goto",
                        "target": app_url,
                        "value": "",
                        "raw_command": f"Navigate to {app_url}",
                        "status": "passed",
                        "error_message": None,
                        "screenshot_url": f"/api/screenshots/{screenshot_filename}",
                        "duration_ms": step_dur
                    }
                    logs.append(log_item)
                    EXECUTION_LOGS_CACHE[execution_id] = list(logs)
                    update_disk_execution_logs(execution_id, logs, status="Running")
                except Exception as e:
                    step_dur = int((time.time() - step_start) * 1000)
                    log_item = {
                        "id": str(uuid.uuid4()),
                        "execution_id": execution_id,
                        "step_number": step_num,
                        "action": "goto",
                        "target": app_url,
                        "value": "",
                        "raw_command": f"Navigate to {app_url}",
                        "status": "failed",
                        "error_message": str(e),
                        "screenshot_url": None,
                        "duration_ms": step_dur
                    }
                    logs.append(log_item)
                    EXECUTION_LOGS_CACHE[execution_id] = list(logs)
                    has_error = True
                    global_err_msg = f"Failed to navigate to {app_url}: {str(e)}"

            # Execute translated JSON steps
            if not has_error:
                for idx, step in enumerate(steps, start=len(logs) + 1):
                    if execution_id in CANCELLED_EXECUTIONS:
                        has_error = True
                        global_err_msg = "Execution stopped by user"
                        break
                    action = step.get("action", "wait").lower()
                    target = step.get("target", "")
                    value = step.get("value", "")
                    raw_cmd = step.get("raw_command", f"{action} {target} {value}".strip())

                    step_start = time.time()
                    screenshot_filename = f"exec_{execution_id}_step_{idx}.png"
                    before_filename = f"exec_{execution_id}_step_{idx}_before.png"
                    screenshot_path = SCREENSHOTS_DIR / screenshot_filename
                    before_path = SCREENSHOTS_DIR / before_filename
                    step_status = "passed"
                    step_err = None

                    try:
                        page.screenshot(path=str(before_path))
                        if action == "goto":
                            page.goto(target, wait_until="domcontentloaded", timeout=action_timeout)
                        elif action == "click":
                            res = smart_click(page, target, timeout=action_timeout)
                            if not res:
                                raise RuntimeError(f"Could not click target '{target}'")
                        elif action == "fill":
                            res = smart_fill(page, target, value, timeout=action_timeout)
                            if not res:
                                raise RuntimeError(f"Could not fill target '{target}'")
                        elif action == "wait":
                            wait_ms = int(value) if str(value).isdigit() else 2000
                            remaining = max(0, wait_ms)
                            while remaining > 0:
                                if execution_id in CANCELLED_EXECUTIONS:
                                    raise RuntimeError("Execution stopped by user")
                                interval = min(250, remaining)
                                time.sleep(interval / 1000.0)
                                remaining -= interval
                        elif action in ["verify", "verify_text"]:
                            clean_target = str(target).strip()
                            for prefix in ["verify_text ", "verify_text:", "verify ", "verify:", "assert ", "check "]:
                                if clean_target.lower().startswith(prefix):
                                    clean_target = clean_target[len(prefix):].strip()
                            clean_target = clean_target.strip('"\'')
                            
                            try:
                                page.get_by_text(clean_target, exact=False).first.wait_for(state="visible", timeout=action_timeout)
                            except Exception:
                                time.sleep(0.5)
                                body_text = page.locator("body").inner_text()
                                norm_target = " ".join(clean_target.lower().split())
                                norm_body = " ".join(body_text.lower().split())
                                if norm_target not in norm_body:
                                    raw_content = page.content().lower()
                                    if norm_target not in raw_content:
                                        raise RuntimeError(f"Text '{clean_target}' not found on page")
                        elif action == "upload_file":
                            if not Path(value).is_file():
                                raise RuntimeError(f"Upload file does not exist: {value}")
                            page.set_input_files(target, value)
                        else:
                            raise RuntimeError(f"Unsupported test action: {action}")

                        time.sleep(0.4) # Brief pause to allow DOM render before screenshot
                        page.screenshot(path=str(screenshot_path))
                    except Exception as e:
                        step_status = "failed"
                        step_err = str(e)
                        has_error = True
                        global_err_msg = step_err
                        try:
                            page.screenshot(path=str(screenshot_path))
                        except Exception:
                            pass

                    step_dur = int((time.time() - step_start) * 1000)
                    log_item = {
                        "id": str(uuid.uuid4()),
                        "execution_id": execution_id,
                        "step_number": idx,
                        "action": action,
                        "target": target,
                        "value": "[REDACTED]" if action == "fill" and _is_sensitive_target(target) else str(value),
                        "raw_command": f"fill {target} [REDACTED]" if action == "fill" and _is_sensitive_target(target) else raw_cmd,
                        "status": step_status,
                        "error_message": step_err,
                        "screenshot_url": f"/api/screenshots/{screenshot_filename}" if screenshot_path.exists() else None,
                        "before_screenshot_url": f"/api/screenshots/{before_filename}" if before_path.exists() else None,
                        "duration_ms": step_dur
                    }
                    logs.append(log_item)
                    EXECUTION_LOGS_CACHE[execution_id] = list(logs)
                    update_disk_execution_logs(execution_id, logs, status="Running")

            browser.close()

    except Exception as e:
        logger.error(f"Global Playwright runner error in execution {execution_id}: {e}")
        has_error = True
        global_err_msg = str(e)

    total_duration = int((time.time() - start_time) * 1000)
    if execution_id in CANCELLED_EXECUTIONS:
        final_status = "Stopped"
        global_err_msg = "Execution stopped by user"
    else:
        final_status = "Failed" if has_error else "Passed"
    
    EXECUTION_STATUS_CACHE[execution_id] = {
        "status": final_status,
        "error_message": global_err_msg,
        "duration_ms": total_duration
    }
    update_disk_execution_logs(execution_id, logs, status=final_status, error_message=global_err_msg, duration_ms=total_duration)
    CANCELLED_EXECUTIONS.discard(execution_id)
    logger.info(f"Execution {execution_id} finished with status: {final_status} in {total_duration}ms")
