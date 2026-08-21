import json
import uuid
import threading
import time
from flask import Blueprint, request, jsonify
from core.playwright_runner import (
    run_playwright_test,
    EXECUTION_LOGS_CACHE,
    EXECUTION_STATUS_CACHE,
    load_json_file,
    EXECUTION_LOGS_DB_FILE,
    EXECUTIONS_DB_FILE
)
from utils.logger import logger

execution_bp = Blueprint("execution_bp", __name__)

@execution_bp.route("/api/execute", methods=["POST"])
def trigger_execution():
    data = request.json or {}
    project_id = data.get("project_id")
    app_url = data.get("app_url", "")
    steps = data.get("steps", [])
    face_auth_enabled = bool(data.get("face_auth_enabled", False))
    y4m_path = data.get("y4m_path", None)
    headless = bool(data.get("headless", True))

    execution_id = str(uuid.uuid4())
    logger.info(f"Received execution trigger request. Assigned ID: {execution_id}")

    # Launch background thread
    thread = threading.Thread(
        target=run_playwright_test,
        kwargs={
            "execution_id": execution_id,
            "app_url": app_url,
            "steps": steps,
            "face_auth_enabled": face_auth_enabled,
            "y4m_path": y4m_path,
            "headless": headless
        },
        daemon=True
    )
    thread.start()

    # Also save initial execution record with project_id to disk immediately
    from core.playwright_runner import load_json_file, save_json_file, EXECUTIONS_DB_FILE
    import time as _time
    all_execs = load_json_file(EXECUTIONS_DB_FILE, [])
    all_execs.insert(0, {
        "id": execution_id,
        "project_id": project_id,
        "status": "Running",
        "error_message": None,
        "duration_ms": 0,
        "created_at": _time.strftime("%Y-%m-%dT%H:%M:%SZ")
    })
    save_json_file(EXECUTIONS_DB_FILE, all_execs)

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
            "logs": logs
        }), 200

    # Fallback to disk storage
    disk_logs = load_json_file(EXECUTION_LOGS_DB_FILE, {})
    all_execs = load_json_file(EXECUTIONS_DB_FILE, [])

    logs = disk_logs.get(execution_id, [])
    exec_meta = next((item for item in all_execs if item.get("id") == execution_id), {})

    return jsonify({
        "execution_id": execution_id,
        "status": exec_meta.get("status", "Passed" if logs else "Unknown"),
        "error_message": exec_meta.get("error_message"),
        "duration_ms": exec_meta.get("duration_ms", 0),
        "logs": logs
    }), 200

@execution_bp.route("/api/executions", methods=["GET"])
def list_executions():
    all_execs = load_json_file(EXECUTIONS_DB_FILE, [])
    project_id = request.args.get("project_id")
    if project_id:
        all_execs = [e for e in all_execs if e.get("project_id") == project_id]
    return jsonify(all_execs), 200

@execution_bp.route("/api/executions/<execution_id>/stop", methods=["POST"])
def stop_execution(execution_id):
    from core.playwright_runner import CANCELLED_EXECUTIONS
    CANCELLED_EXECUTIONS.add(execution_id)
    logger.info(f"Stop command registered for execution {execution_id}")
    return jsonify({"message": "Stop request registered"}), 200

