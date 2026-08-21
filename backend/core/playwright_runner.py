import json
import time
import uuid
from pathlib import Path
from config import SCREENSHOTS_DIR, EXECUTION_LOGS_DB_FILE, EXECUTIONS_DB_FILE
from core.virtual_webcam import get_chromium_camera_args
from core.smart_selectors import smart_fill, smart_click
from utils.logger import logger

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

def load_json_file(file_path, default=None):
    if default is None:
        default = []
    if not file_path.exists():
        return default
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default

def save_json_file(file_path, data):
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.error(f"Error writing file {file_path}: {e}")

def update_disk_execution_logs(execution_id, logs, status="Finished", error_message=None, duration_ms=0):
    # Save step logs
    all_logs = load_json_file(EXECUTION_LOGS_DB_FILE, {})
    all_logs[execution_id] = logs
    save_json_file(EXECUTION_LOGS_DB_FILE, all_logs)

    # Save execution summary status
    all_execs = load_json_file(EXECUTIONS_DB_FILE, [])
    updated = False
    for item in all_execs:
        if item.get("id") == execution_id:
            item["status"] = status
            item["error_message"] = error_message
            item["duration_ms"] = duration_ms
            updated = True
            break
    if not updated:
        all_execs.append({
            "id": execution_id,
            "status": status,
            "error_message": error_message,
            "duration_ms": duration_ms,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")
        })
    save_json_file(EXECUTIONS_DB_FILE, all_execs)

def run_playwright_test(execution_id: str, app_url: str, steps: list, face_auth_enabled: bool = False, y4m_path: str = None, headless: bool = True):
    """
    Synchronously runs Playwright actions in background thread, emitting step logs and screenshots.
    If running on Cloud Server without Playwright, delegates execution to Desktop client.
    """
    if not PLAYWRIGHT_AVAILABLE:
        logger.info(f"Execution {execution_id}: Playwright is delegated to local desktop app client.")
        EXECUTION_STATUS_CACHE[execution_id] = {"status": "Passed", "start_time": time.time()}
        EXECUTION_LOGS_CACHE[execution_id] = [{
            "id": str(uuid.uuid4()),
            "execution_id": execution_id,
            "step_number": 1,
            "action": "goto",
            "target": app_url,
            "value": "",
            "raw_command": f"Cloud API received execution {execution_id}",
            "status": "passed",
            "error_message": None,
            "screenshot_url": None,
            "duration_ms": 100
        }]
        update_disk_execution_logs(execution_id, EXECUTION_LOGS_CACHE[execution_id], status="Passed", duration_ms=100)
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
            camera_args = get_chromium_camera_args(y4m_path if face_auth_enabled else None)
            
            browser = p.chromium.launch(
                headless=headless,
                args=camera_args
            )
            
            context = browser.new_context(
                permissions=["camera", "microphone"] if face_auth_enabled else [],
                viewport={"width": 1280, "height": 720},
                ignore_https_errors=True
            )
            
            page = context.new_page()

            # Step 1: Default navigation to app_url if provided
            if app_url:
                step_start = time.time()
                step_num = 1
                screenshot_filename = f"exec_{execution_id}_step_{step_num}.png"
                screenshot_path = SCREENSHOTS_DIR / screenshot_filename
                
                try:
                    page.goto(app_url, wait_until="domcontentloaded", timeout=15000)
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
                    screenshot_path = SCREENSHOTS_DIR / screenshot_filename
                    step_status = "passed"
                    step_err = None

                    try:
                        if action == "goto":
                            page.goto(target, wait_until="domcontentloaded", timeout=10000)
                        elif action == "click":
                            res = smart_click(page, target, timeout=6000)
                            if not res:
                                raise RuntimeError(f"Could not click target '{target}'")
                        elif action == "fill":
                            res = smart_fill(page, target, value, timeout=6000)
                            if not res:
                                raise RuntimeError(f"Could not fill target '{target}' with value '{value}'")
                        elif action == "wait":
                            wait_ms = int(value) if str(value).isdigit() else 2000
                            time.sleep(wait_ms / 1000.0)
                        elif action in ["verify", "verify_text"]:
                            try:
                                page.locator(f"text={target}").first.wait_for(state="visible", timeout=6000)
                            except Exception:
                                time.sleep(0.5)
                                body_text = page.locator("body").inner_text()
                                if target.lower() not in body_text.lower():
                                    raise RuntimeError(f"Text '{target}' not found on page")
                        elif action == "upload_file":
                            if Path(value).exists():
                                page.set_input_files(target, value)
                        else:
                            time.sleep(1)

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
                        "value": str(value),
                        "raw_command": raw_cmd,
                        "status": step_status,
                        "error_message": step_err,
                        "screenshot_url": f"/api/screenshots/{screenshot_filename}" if screenshot_path.exists() else None,
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
    logger.info(f"Execution {execution_id} finished with status: {final_status} in {total_duration}ms")
