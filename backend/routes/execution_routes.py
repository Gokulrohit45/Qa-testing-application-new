import json
import uuid
import threading
import time
from urllib.parse import urlparse
from flask import Blueprint, request, jsonify
from core.playwright_runner import (
    run_playwright_test,
    EXECUTION_LOGS_CACHE,
    EXECUTION_STATUS_CACHE,
    TELEMETRY_CACHE,
    load_json_file,
    EXECUTION_LOGS_DB_FILE,
    EXECUTIONS_DB_FILE,
    PLAYWRIGHT_AVAILABLE
)
from utils.logger import logger
from utils.local_store import list_records, upsert, get
from routes.translate_routes import normalize_steps

def _normalized_asset_name(value):
    from pathlib import Path
    return Path(str(value or '').strip().strip('"\'')).stem.casefold()

def resolve_upload_assets(project_id, steps):
    assets = list_records("asset", project_id=str(project_id))
    for step in steps:
        if str(step.get("action", "")).lower() != "upload_file":
            continue
        raw_requested = str(step.get("value") or '').strip().strip('"\'').casefold()
        exact_matches = [asset for asset in assets if str(asset.get("filename") or '').casefold() == raw_requested]
        requested = _normalized_asset_name(step.get("value"))
        matches = exact_matches or [asset for asset in assets if _normalized_asset_name(asset.get("filename")) == requested]
        if not matches:
            raise ValueError(f"Project asset not found: {step.get('value')}. Upload it under Project Assets first.")
        if len(matches) > 1:
            raise ValueError(f"Multiple project assets match '{step.get('value')}'. Use the complete filename including extension.")
        step["value"] = matches[0].get("stored_path", "")
        step["asset_name"] = matches[0].get("filename", "")
        if str(step.get("target", "")).strip().lower() in {"", "file", "dataset", "upload"}:
            step["target"] = "input[type='file']"
        step["critical"] = True
    return steps

execution_bp = Blueprint("execution_bp", __name__)

@execution_bp.route("/api/execute", methods=["POST"])
def trigger_execution():
    data = request.json or {}
    project_id = data.get("project_id")
    user_id = data.get("user_id")
    app_url = data.get("app_url", "")
    steps = data.get("steps", [])
    face_auth_enabled = bool(data.get("face_auth_enabled", False))
    y4m_path = data.get("y4m_path", None)
    headless = bool(data.get("headless", True))
    try:
        timeout_seconds = max(3, min(int(data.get("timeout_seconds", 30)), 300))
    except (TypeError, ValueError):
        return jsonify({"error": "timeout_seconds must be a number between 3 and 300"}), 400

    if not project_id or not app_url or not isinstance(steps, list) or not steps:
        return jsonify({"error": "project_id, app_url, and at least one test step are required"}), 400
    parsed_url = urlparse(app_url)
    if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
        return jsonify({"error": "app_url must be a valid HTTP or HTTPS URL"}), 400
    # Test cases can contain cached JSON produced by an older parser. Always
    # normalize again at execution time so legacy steps such as a CLICK whose
    # raw command starts with ``upload_file`` are repaired before validation
    # and asset resolution.
    steps = normalize_steps([dict(step) if isinstance(step, dict) else step for step in steps])
    allowed_actions = {"goto", "click", "fill", "wait", "verify", "verify_text", "upload_file"}
    invalid_actions = [step.get("action") for step in steps if not isinstance(step, dict) or str(step.get("action", "")).lower() not in allowed_actions]
    if invalid_actions:
        return jsonify({"error": f"Unsupported test actions: {invalid_actions}"}), 400
    try:
        steps = resolve_upload_assets(project_id, [dict(step) for step in steps])
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    for step in steps:
        if str(step.get("action", "")).lower() == "goto":
            parsed_target = urlparse(str(step.get("target", "")))
            if parsed_target.scheme not in {"http", "https"} or not parsed_target.netloc:
                return jsonify({"error": "Every goto target must be a valid HTTP or HTTPS URL"}), 400
    if steps and str(steps[0].get("action", "")).lower() == "goto" and str(steps[0].get("target", "")).rstrip('/') == app_url.rstrip('/'):
        steps = steps[1:] or [{"action": "wait", "target": "", "value": "250", "raw_command": "Wait for initial page readiness"}]
    if not PLAYWRIGHT_AVAILABLE:
        return jsonify({"error": "The local Playwright runtime is not installed correctly"}), 503

    execution_id = str(uuid.uuid4())
    logger.info(f"Received execution trigger request. Assigned ID: {execution_id}")

    # Save the initial record before starting the worker to prevent completion races.
    upsert("execution", {
        "id": execution_id, "project_id": project_id, "user_id": user_id,
        "test_id": data.get("test_id"), "status": "Running", "error_message": None,
        "duration_ms": 0, "browser": "Chromium", "headless": headless,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")
    })

    thread = threading.Thread(
        target=run_playwright_test,
        kwargs={
            "execution_id": execution_id,
            "app_url": app_url,
            "steps": steps,
            "face_auth_enabled": face_auth_enabled,
            "y4m_path": y4m_path,
            "headless": headless
            ,"timeout_seconds": timeout_seconds
        },
        daemon=True
    )
    thread.start()

    return jsonify({
        "execution_id": execution_id,
        "status": "Running",
        "message": "Playwright execution started in background"
    }), 202

@execution_bp.route("/api/executions/<execution_id>/logs", methods=["GET"])
def get_execution_logs(execution_id):
    # Try in-memory cache first
    if execution_id in EXECUTION_LOGS_CACHE:
        logs = EXECUTION_LOGS_CACHE[execution_id]
        status_info = EXECUTION_STATUS_CACHE.get(execution_id, {"status": "Running"})
        return jsonify({
            "execution_id": execution_id,
            "status": status_info.get("status", "Running"),
            "error_message": status_info.get("error_message"),
            "duration_ms": status_info.get("duration_ms", 0),
            "logs": logs,
            "telemetry": TELEMETRY_CACHE.get(execution_id, [])
        }), 200

    # Fallback to disk storage
    log_record = get("execution_logs", execution_id) or {}
    logs = log_record.get("logs", [])
    exec_meta = get("execution", execution_id) or {}

    telemetry_record = get("telemetry", execution_id) or {}
    return jsonify({
        "execution_id": execution_id,
        "status": exec_meta.get("status", "Passed" if logs else "Unknown"),
        "error_message": exec_meta.get("error_message"),
        "duration_ms": exec_meta.get("duration_ms", 0),
        "logs": logs,
        "telemetry": telemetry_record.get("spans", [])
    }), 200

@execution_bp.route("/api/executions", methods=["GET"])
def list_executions():
    return jsonify(list_records("execution", user_id=request.args.get("user_id"), project_id=request.args.get("project_id"))), 200

@execution_bp.route("/api/executions/<execution_id>/stop", methods=["POST"])
def stop_execution(execution_id):
    from core.playwright_runner import CANCELLED_EXECUTIONS
    CANCELLED_EXECUTIONS.add(execution_id)
    logger.info(f"Stop command registered for execution {execution_id}")
    return jsonify({"message": "Stop request registered"}), 200
