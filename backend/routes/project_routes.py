import json
import uuid
import time
from flask import Blueprint, request, jsonify
from config import PROJECTS_DB_FILE
from utils.logger import logger

project_bp = Blueprint("project_bp", __name__)

DEFAULT_STARTER_PROJECTS = []

def load_projects():
    if not PROJECTS_DB_FILE.exists():
        save_projects(DEFAULT_STARTER_PROJECTS)
        return DEFAULT_STARTER_PROJECTS
    try:
        with open(PROJECTS_DB_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if not data:
                save_projects(DEFAULT_STARTER_PROJECTS)
                return DEFAULT_STARTER_PROJECTS
            return data
    except Exception:
        save_projects(DEFAULT_STARTER_PROJECTS)
        return DEFAULT_STARTER_PROJECTS

def save_projects(projects):
    try:
        with open(PROJECTS_DB_FILE, "w", encoding="utf-8") as f:
            json.dump(projects, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to save projects to disk: {e}")

@project_bp.route("/api/projects", methods=["GET"])
def get_projects():
    projects = load_projects()
    return jsonify(projects), 200

@project_bp.route("/api/projects", methods=["POST"])
def create_project():
    data = request.json or {}
    name = data.get("name")
    app_name = data.get("app_name", name)
    app_url = data.get("app_url", "")
    description = data.get("description", "")
    face_auth_enabled = bool(data.get("face_auth_enabled", False))

    if not name or not app_url:
        return jsonify({"error": "Project name and app_url are required"}), 400

    new_project = {
        "id": str(uuid.uuid4()),
        "user_id": data.get("user_id", "user_local"),
        "name": name,
        "app_name": app_name,
        "app_url": app_url,
        "description": description,
        "face_auth_enabled": face_auth_enabled,
        "video_file_path": data.get("video_file_path", None),
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")
    }

    projects = load_projects()
    projects.insert(0, new_project)
    save_projects(projects)

    return jsonify(new_project), 201

@project_bp.route("/api/projects/<project_id>", methods=["DELETE"])
def delete_project(project_id):
    projects = load_projects()
    updated = [p for p in projects if p.get("id") != project_id]
    save_projects(updated)
    return jsonify({"success": True, "message": "Project deleted"}), 200
