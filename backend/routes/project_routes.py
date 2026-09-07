import time
import uuid
from flask import Blueprint, request, jsonify
from utils.local_store import list_records, upsert, get, delete_project_tree
from core.project_contract import normalize_project

project_bp = Blueprint("project_bp", __name__)

@project_bp.route("/api/projects", methods=["GET"])
def get_projects():
    return jsonify(list_records("project", user_id=request.args.get("user_id"))), 200

@project_bp.route("/api/projects", methods=["POST"])
def create_project():
    data = request.json or {}
    if not isinstance(data, dict):
        return jsonify({"error": "Project must be an object"}), 400
    try:
        data = normalize_project(data)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ")
    record = {**data, "id": data.get("id") or str(uuid.uuid4()),
        "app_name": data.get("app_name") or data["name"], "description": data.get("description", ""),
        "face_auth_enabled": bool(data.get("face_auth_enabled", False)),
        "created_at": data.get("created_at") or now, "updated_at": now}
    upsert("project", record)
    return jsonify(record), 201

@project_bp.route("/api/projects/<project_id>", methods=["PUT"])
def update_project(project_id):
    current = get("project", project_id)
    if not current: return jsonify({"error": "Project not found"}), 404
    allowed = {"name", "app_name", "app_url", "description", "face_auth_enabled", "video_file_path", "face_video_storage_path", "sync_state"}
    current.update({key: value for key, value in (request.json or {}).items() if key in allowed})
    try:
        current = normalize_project(current)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    current["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ")
    upsert("project", current)
    return jsonify(current), 200

@project_bp.route("/api/projects/<project_id>", methods=["DELETE"])
def delete_project(project_id):
    if not get("project", project_id): return jsonify({"error": "Project not found"}), 404
    delete_project_tree(project_id)
    return jsonify({"success": True}), 200
