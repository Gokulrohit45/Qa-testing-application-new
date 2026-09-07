import json
import time
import uuid
import threading
from pathlib import Path
from config import SCREENSHOTS_DIR, EXECUTION_LOGS_DB_FILE, EXECUTIONS_DB_FILE
from core.virtual_webcam import get_chromium_camera_args
from core.smart_selectors import smart_fill, smart_click, smart_select, resolve_target
from core.assertions import check_outcome, OutcomeError
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
TELEMETRY_CACHE = {}
CANCELLED_EXECUTIONS = set()
STORAGE_LOCK = threading.RLock()

def _is_sensitive_target(target):
    lowered = str(target).lower()
    return any(word in lowered for word in ("password", "passwd", "pwd", "secret", "token", "api key", "otp"))

def _redact_runtime(value, secrets):
    if isinstance(value, dict):
        return {key: _redact_runtime(item, secrets) for key, item in value.items()}
    if isinstance(value, list):
        return [_redact_runtime(item, secrets) for item in value]
    if isinstance(value, str):
        for secret in sorted(set(secrets), key=len, reverse=True):
            if secret:
                value = value.replace(secret, '[REDACTED]')
    return value

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

def _new_span(execution_id, trace_id, name, started, status="OK", attributes=None, parent_span_id=None):
    return {
        "id": str(uuid.uuid4()), "execution_id": execution_id, "trace_id": trace_id,
        "span_id": uuid.uuid4().hex[:16], "parent_span_id": parent_span_id,
        "service_name": "local-playwright-runner", "name": name,
        "status_code": status, "duration_ms": max(0, int((time.time() - started) * 1000)),
        "attributes": attributes or {}, "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")
    }

def _record_telemetry(execution_id, spans):
    TELEMETRY_CACHE[execution_id] = list(spans)
    store_upsert("telemetry", {"id": execution_id, "spans": spans})

def run_playwright_test(execution_id: str, app_url: str, steps: list, face_auth_enabled: bool = False, y4m_path: str = None, headless: bool = True, timeout_seconds: int = 30, expected_step_count: int = None):
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
    expected_step_count = max(1, int(expected_step_count or (len(steps) + 1)))
    EXECUTION_STATUS_CACHE[execution_id] = {
        "status": "Running", "start_time": time.time(), "expected_steps": expected_step_count
    }
    EXECUTION_LOGS_CACHE[execution_id] = []

    start_time = time.time()
    logs = []
    trace_id = uuid.uuid4().hex
    spans = []
    root_span_id = uuid.uuid4().hex[:16]
    has_error = False
    global_err_msg = None
    runtime_secrets = [value for step in steps for value in step.get('_runtime_secrets', [])]
    def redact(value):
        return _redact_runtime(value, runtime_secrets)

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
            request_started = {}
            current_step = {"number": 0, "action": "browser_start", "target": app_url}
            def request_key(request):
                return f"{request.method} {request.url}"
            def on_request(request):
                request_started.setdefault(request_key(request), []).append({
                    "started": time.time(), "step_number": current_step["number"],
                    "step_action": current_step["action"], "step_target": current_step["target"]
                })
            def request_start(request):
                queue = request_started.get(request_key(request), [])
                observed = queue.pop(0) if queue else {
                    "started": time.time(), "step_number": current_step["number"],
                    "step_action": current_step["action"], "step_target": current_step["target"]
                }
                if not queue:
                    request_started.pop(request_key(request), None)
                return observed
            def on_response(response):
                observed = request_start(response.request)
                spans.append(_new_span(execution_id, trace_id, f"HTTP {response.request.method} {response.url.split('?')[0]}", observed["started"],
                    "ERROR" if response.status >= 400 else "OK", {"type": "http", "method": response.request.method,
                    "url": response.url.split('?')[0], "http_status": response.status,
                    "step_number": observed["step_number"], "step_action": observed["step_action"],
                    "step_target": observed["step_target"]}, root_span_id))
                _record_telemetry(execution_id, redact(spans))
            def on_request_failed(request):
                observed = request_start(request)
                spans.append(_new_span(execution_id, trace_id, f"HTTP FAILED {request.method} {request.url.split('?')[0]}", observed["started"],
                    "ERROR", {"type": "http", "method": request.method, "url": request.url.split('?')[0],
                    "failure": str(request.failure or "Request failed"),
                    "step_number": observed["step_number"], "step_action": observed["step_action"],
                    "step_target": observed["step_target"]}, root_span_id))
                _record_telemetry(execution_id, redact(spans))
            page.on("request", on_request)
            page.on("response", on_response)
            page.on("requestfailed", on_request_failed)
            action_timeout = max(3, min(int(timeout_seconds), 300)) * 1000
            page.set_default_timeout(action_timeout)

            # Step 1: Default navigation to app_url if provided
            initial_navigation_added = bool(app_url and not (steps and steps[0].get("action") == "goto" and str(steps[0].get("target", "")).rstrip('/') == app_url.rstrip('/')))
            if initial_navigation_added:
                step_start = time.time()
                step_num = 1
                current_step.update({"number": step_num, "action": "goto", "target": app_url})
                screenshot_filename = f"exec_{execution_id}_step_{step_num}.png"
                screenshot_path = SCREENSHOTS_DIR / screenshot_filename
                
                try:
                    page.goto(app_url, wait_until="domcontentloaded", timeout=action_timeout)
                    try:
                        page.screenshot(path=str(screenshot_path), timeout=1000)
                    except Exception:
                        pass
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
                        "duration_ms": step_dur,
                        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")
                    }
                    logs.append(log_item)
                    spans.append(_new_span(execution_id, trace_id, "playwright.goto", step_start, "OK", {"type": "step", "action": "goto", "target": app_url}, root_span_id))
                    _record_telemetry(execution_id, redact(spans))
                    EXECUTION_LOGS_CACHE[execution_id] = redact(logs)
                    update_disk_execution_logs(execution_id, redact(logs), status="Running")
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
                        "duration_ms": step_dur,
                        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")
                    }
                    logs.append(log_item)
                    spans.append(_new_span(execution_id, trace_id, "playwright.goto", step_start, "ERROR", {"type": "step", "action": "goto", "target": app_url, "error": str(e)}, root_span_id))
                    _record_telemetry(execution_id, redact(spans))
                    EXECUTION_LOGS_CACHE[execution_id] = redact(logs)
                    has_error = True
                    global_err_msg = f"Failed to navigate to {app_url}: {str(e)}"

            # Execute translated JSON steps
            if not has_error:
                outcomes = {}
                for step_offset, step in enumerate(steps):
                    idx = len(logs) + 1
                    if execution_id in CANCELLED_EXECUTIONS:
                        has_error = True
                        global_err_msg = "Execution stopped by user"
                        break
                    action = step.get("action", "wait").lower()
                    target = step.get("target", "")
                    value = step.get("value", "")
                    raw_cmd = step.get("raw_command", f"{action} {target} {value}".strip())
                    current_step.update({"number": idx, "action": action, "target": target})

                    # Only explicit dependencies block later independent actions.
                    # A wait must not erase a failed prerequisite.
                    blocked_dependencies = [d for d in step.get("depends_on", []) if outcomes.get(d) != "passed"]
                    if blocked_dependencies:
                        logs.append({"id": str(uuid.uuid4()), "execution_id": execution_id,
                            "step_number": idx, "action": action, "target": target, "value": "",
                            "raw_command": "[BLOCKED]", "status": "skipped",
                            "error_message": f"Blocked by unsuccessful prerequisite test steps: {blocked_dependencies}",
                            "screenshot_url": None, "duration_ms": 0,
                            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")})
                        EXECUTION_LOGS_CACHE[execution_id] = redact(logs)
                        update_disk_execution_logs(execution_id, redact(logs), status="Running", error_message=global_err_msg)
                        outcomes[step_offset + 1] = "skipped"
                        continue

                    step_start = time.time()
                    screenshot_filename = f"exec_{execution_id}_step_{idx}.png"
                    before_filename = f"exec_{execution_id}_step_{idx}_before.png"
                    screenshot_path = SCREENSHOTS_DIR / screenshot_filename
                    before_path = SCREENSHOTS_DIR / before_filename
                    step_status = "passed"
                    step_err = None
                    action_completed = False
                    assertion_status = "not_requested"
                    observed = None
                    def evidence(path):
                        try:
                            page.screenshot(path=str(path), timeout=1000)
                        except Exception:
                            pass  # Evidence capture cannot change an action/assertion result.

                    try:
                        evidence(before_path)
                        deadline = time.monotonic() + action_timeout / 1000
                        def budget():
                            remaining = int((deadline - time.monotonic()) * 1000)
                            if remaining <= 0:
                                raise RuntimeError("Step timeout exhausted; no additional recovery budget remains")
                            return remaining
                        if action == "goto":
                            page.goto(target, wait_until="domcontentloaded", timeout=budget())
                        elif action == "click":
                            res = smart_click(page, target, timeout=budget())
                            if not res:
                                raise RuntimeError(f"Could not click target '{target}'")
                        elif action == "fill":
                            res = smart_fill(page, target, value, timeout=budget())
                            if not res:
                                raise RuntimeError(f"Could not fill target '{target}'")
                        elif action == "select":
                            smart_select(page, target, value, timeout=budget())
                        elif action == "wait":
                            wait_ms = int(float(value))
                            deadline += wait_ms / 1000
                            remaining = max(0, wait_ms)
                            while remaining > 0:
                                if execution_id in CANCELLED_EXECUTIONS:
                                    raise RuntimeError("Execution stopped by user")
                                interval = min(250, remaining)
                                time.sleep(interval / 1000.0)
                                remaining -= interval
                        elif action in ["verify", "verify_text"]:
                            assertion_status = "running"
                            observed = check_outcome(page, {"target": target, "sensitive": step.get('sensitive')}, budget())
                            assertion_status = "passed"
                        elif action == "upload_file":
                            if not Path(value).is_file():
                                raise RuntimeError(f"Upload file does not exist: {value}")
                            upload_target = target or "input[type='file']"
                            inputs = resolve_target(page, "css:" + upload_target if not upload_target.startswith(("css:", "label:", "testid:")) else upload_target, budget(), visible=False)
                            inputs.set_input_files(value, timeout=budget())
                        else:
                            raise RuntimeError(f"Unsupported test action: {action}")

                        action_completed = True
                        if step.get("expected_type"):
                            assertion_status = "running"
                            observed = check_outcome(page, step, budget())
                            assertion_status = "passed"
                        evidence(screenshot_path)
                    except Exception as e:
                        step_status = "failed"
                        step_err = redact(str(e))
                        if assertion_status == "running":
                            assertion_status = "failed"
                        if isinstance(e, OutcomeError):
                            observed = e.observed
                        has_error = True
                        if not global_err_msg:
                            global_err_msg = step_err
                        evidence(screenshot_path)

                    step_dur = int((time.time() - step_start) * 1000)
                    log_item = {
                        "id": str(uuid.uuid4()),
                        "execution_id": execution_id,
                        "step_number": idx,
                        "action": action,
                        "target": target,
                        "value": (step.get("asset_name") or Path(value).name) if action == "upload_file" else ("[REDACTED]" if step.get("sensitive") or action == "fill" and _is_sensitive_target(target) else str(value)),
                        "raw_command": f"{action} {target} [REDACTED]" if step.get("sensitive") or action == "fill" and _is_sensitive_target(target) else raw_cmd,
                        "status": step_status,
                        "action_completed": action_completed,
                        "assertion_status": assertion_status,
                        "expected_type": step.get("expected_type") or ("text_visible" if action in {"verify", "verify_text"} else None),
                        "expected_value": "[REDACTED]" if step.get("sensitive") or step.get("expected_type") == "field_value" else step.get("expected_value", target if action in {"verify", "verify_text"} else ""),
                        "observed": observed,
                        "error_message": step_err,
                        "screenshot_url": f"/api/screenshots/{screenshot_filename}" if screenshot_path.exists() else None,
                        "before_screenshot_url": f"/api/screenshots/{before_filename}" if before_path.exists() else None,
                        "duration_ms": step_dur,
                        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")
                    }
                    logs.append(log_item)
                    outcomes[step_offset + 1] = step_status
                    spans.append(_new_span(execution_id, trace_id, f"playwright.{action}", step_start,
                        "ERROR" if step_status == "failed" else "OK",
                        {"type": "step", "step_number": idx, "action": action, "target": target,
                         "asset_name": step.get("asset_name"), "error": step_err}, root_span_id))
                    _record_telemetry(execution_id, redact(spans))
                    EXECUTION_LOGS_CACHE[execution_id] = redact(logs)
                    update_disk_execution_logs(execution_id, redact(logs), status="Running")
                    is_critical = bool(step.get("critical")) or action in {"goto", "upload_file"}
                    if step_status == "failed" and is_critical:
                        for skipped in steps[step_offset + 1:]:
                            logs.append({"id": str(uuid.uuid4()), "execution_id": execution_id,
                                "step_number": len(logs) + 1, "action": str(skipped.get("action", "wait")).lower(),
                                "target": skipped.get("target", ""), "value": "", "raw_command": "[BLOCKED]",
                                "status": "skipped", "error_message": f"Skipped because critical step #{idx} failed: {step_err}",
                                "screenshot_url": None, "duration_ms": 0,
                                "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")})
                        EXECUTION_LOGS_CACHE[execution_id] = redact(logs)
                        update_disk_execution_logs(execution_id, redact(logs), status="Running", error_message=global_err_msg)
                        break

            if initial_navigation_added and has_error and not logs[1:] and logs and logs[0].get("status") == "failed":
                for skipped in steps:
                    logs.append({"id": str(uuid.uuid4()), "execution_id": execution_id,
                        "step_number": len(logs) + 1, "action": skipped.get("action"),
                        "target": skipped.get("target"), "value": "", "raw_command": "[BLOCKED]",
                        "status": "skipped", "error_message": "Blocked because initial navigation failed",
                        "duration_ms": 0, "screenshot_url": None,
                        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")})
            browser.close()

    except Exception as e:
        logger.error(f"Global Playwright runner error in execution {execution_id}: {redact(str(e))}")
        has_error = True
        global_err_msg = redact(str(e))

    total_duration = int((time.time() - start_time) * 1000)
    if execution_id in CANCELLED_EXECUTIONS:
        final_status = "Stopped"
        global_err_msg = "Execution stopped by user"
    elif len(logs) < expected_step_count:
        final_status = "Failed"
        has_error = True
        global_err_msg = global_err_msg or (
            f"Execution produced {len(logs)} of {expected_step_count} expected step results. "
            "The test translation or execution plan is incomplete."
        )
    else:
        final_status = "Failed" if has_error else "Passed"
    
    EXECUTION_STATUS_CACHE[execution_id] = {
        "status": final_status,
        "error_message": global_err_msg,
        "duration_ms": total_duration, "trace_id": trace_id,
        "expected_steps": expected_step_count
    }
    spans.append({"id": str(uuid.uuid4()), "execution_id": execution_id, "trace_id": trace_id,
        "span_id": root_span_id, "parent_span_id": None, "service_name": "local-playwright-runner",
        "name": "test.execution", "status_code": "ERROR" if has_error else "OK", "duration_ms": total_duration,
        "attributes": {"type": "execution", "status": final_status}, "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")})
    _record_telemetry(execution_id, redact(spans))
    EXECUTION_LOGS_CACHE[execution_id] = redact(logs)
    update_disk_execution_logs(execution_id, redact(logs), status=final_status, error_message=global_err_msg, duration_ms=total_duration)
    CANCELLED_EXECUTIONS.discard(execution_id)
    logger.info(f"Execution {execution_id} finished with status: {final_status} in {total_duration}ms")
