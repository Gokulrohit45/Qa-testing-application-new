import os
import requests
import uuid
from pathlib import Path
from flask import Blueprint, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from config import VIDEOS_DIR, SCREENSHOTS_DIR, DATA_DIR, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
from utils.ffmpeg_helper import convert_mp4_to_y4m
from utils.logger import logger
from utils.local_store import list_records, upsert, delete

asset_bp = Blueprint("asset_bp", __name__)

ASSETS_DIR = DATA_DIR / "project_assets"
ASSETS_DIR.mkdir(parents=True, exist_ok=True)


def _cloud_user_id():
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not token or not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return None
    response = requests.get(
        f"{SUPABASE_URL.rstrip('/')}/auth/v1/user",
        headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"},
        timeout=10,
    )
    if not response.ok:
        return None
    return response.json().get("id")

def _service_headers(prefer=None):
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers

@asset_bp.route("/api/cloud/project-assets", methods=["POST"])
def save_cloud_asset_metadata():
    user_id = _cloud_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    if not SUPABASE_SERVICE_ROLE_KEY:
        return jsonify({"error": "Cloud asset service is not configured"}), 503
    payload = request.get_json(silent=True) or {}
    if payload.get("user_id") != user_id:
        return jsonify({"error": "Asset owner does not match the signed-in account"}), 403
    allowed = {"id", "project_id", "user_id", "filename", "storage_path", "size_bytes", "content_type", "created_at"}
    record = {key: payload[key] for key in allowed if key in payload}
    if not all(record.get(key) for key in ("id", "project_id", "filename", "storage_path")):
        return jsonify({"error": "Incomplete asset metadata"}), 400
    response = requests.post(
        f"{SUPABASE_URL.rstrip('/')}/rest/v1/project_assets",
        params={"on_conflict": "id"}, json=record,
        headers=_service_headers("resolution=merge-duplicates,return=representation"), timeout=15,
    )
    if response.ok:
        rows = response.json()
        return jsonify(rows[0] if rows else record), 200

    workspace = requests.get(
        f"{SUPABASE_URL.rstrip('/')}/rest/v1/desktop_workspaces",
        params={"id": f"eq.{record['project_id']}", "user_id": f"eq.{user_id}", "deleted": "eq.false", "select": "payload"},
        headers=_service_headers(), timeout=15,
    )
    workspace_rows = workspace.json() if workspace.ok else []
    if not workspace_rows:
        logger.error(f"Cloud asset metadata save failed: {response.text}")
        return jsonify({"error": "Cloud asset metadata could not be saved"}), 502
    snapshot = workspace_rows[0].get("payload") or {}
    assets = [item for item in snapshot.get("project_assets", []) if item.get("id") != record["id"]]
    snapshot["project_assets"] = [record, *assets]
    update = requests.patch(
        f"{SUPABASE_URL.rstrip('/')}/rest/v1/desktop_workspaces",
        params={"id": f"eq.{record['project_id']}", "user_id": f"eq.{user_id}"},
        json={"payload": snapshot}, headers=_service_headers("return=minimal"), timeout=15,
    )
    if not update.ok:
        logger.error(f"Desktop workspace asset metadata save failed: {update.text}")
        return jsonify({"error": "Cloud asset metadata could not be saved"}), 502
    return jsonify(record), 200

# ── Upload Face Video ──────────────────────────────────────────────────────────
@asset_bp.route("/api/cloud/project-assets", methods=["GET"])
def list_cloud_asset_metadata():
    user_id = _cloud_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    project_id = request.args.get("project_id", "")
    response = requests.get(
        f"{SUPABASE_URL.rstrip('/')}/rest/v1/project_assets",
        params={"project_id": f"eq.{project_id}", "user_id": f"eq.{user_id}", "select": "*"},
        headers=_service_headers(), timeout=15,
    )
    rows = response.json() if response.ok else []
    workspace = requests.get(
        f"{SUPABASE_URL.rstrip('/')}/rest/v1/desktop_workspaces",
        params={"id": f"eq.{project_id}", "user_id": f"eq.{user_id}", "deleted": "eq.false", "select": "payload"},
        headers=_service_headers(), timeout=15,
    )
    workspace_rows = workspace.json() if workspace.ok else []
    embedded = (workspace_rows[0].get("payload") or {}).get("project_assets", []) if workspace_rows else []
    merged = {item["id"]: item for item in [*rows, *embedded] if item.get("id")}
    return jsonify(list(merged.values())), 200

@asset_bp.route("/api/upload-video", methods=["POST"])
def upload_video():
    if "video" not in request.files:
        return jsonify({"error": "No video file provided"}), 400

    file = request.files["video"]
    project_id = request.form.get("project_id", "")

    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400
    if Path(file.filename).suffix.lower() not in {".mp4", ".mov", ".webm", ".m4v"}:
        return jsonify({"error": "Unsupported video type"}), 400
    try:
        project_id = str(uuid.UUID(project_id))
    except (ValueError, TypeError):
        return jsonify({"error": "A valid project ID is required"}), 400

    filename_base = str(uuid.uuid4())
    mp4_filename = f"{filename_base}.mp4"
    y4m_filename = f"{filename_base}.y4m"

    mp4_path = VIDEOS_DIR / mp4_filename
    y4m_path = VIDEOS_DIR / y4m_filename

    try:
        file.save(str(mp4_path))
        logger.info(f"Saved uploaded MP4 video to {mp4_path}")
        success = convert_mp4_to_y4m(str(mp4_path), str(y4m_path))

        if not success or not y4m_path.exists():
            return jsonify({"error": "Video conversion failed. The uploaded video was not activated.", "mp4_url": f"/api/videos/{mp4_filename}"}), 422

        return jsonify({
            "success": True,
            "mp4_path": str(mp4_path),
            "mp4_url": f"/api/videos/{mp4_filename}",
            "y4m_path": str(y4m_path),
            "y4m_ready": True,
            "project_id": project_id
        }), 201

    except Exception as e:
        logger.error(f"Error uploading video: {e}")
        return jsonify({"error": str(e)}), 500

# ── Upload Generic Project Asset ───────────────────────────────────────────────
@asset_bp.route("/api/upload-asset", methods=["POST"])
def upload_asset():
    if "asset" not in request.files:
        return jsonify({"error": "No asset file provided"}), 400

    file = request.files["asset"]
    project_id = request.form.get("project_id", "")

    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    try:
        safe_project_id = str(uuid.UUID(project_id))
    except (ValueError, TypeError):
        return jsonify({"error": "A valid project ID is required"}), 400
    project_assets_dir = ASSETS_DIR / safe_project_id
    project_assets_dir.mkdir(parents=True, exist_ok=True)

    requested_asset_id = request.form.get("asset_id", "")
    try:
        asset_id = str(uuid.UUID(requested_asset_id)) if requested_asset_id else str(uuid.uuid4())
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid asset ID"}), 400
    original_name = secure_filename(file.filename)
    if not original_name:
        return jsonify({"error": "Invalid filename"}), 400
    safe_name = f"{asset_id}_{original_name}"
    file_path = project_assets_dir / safe_name

    try:
        file.save(str(file_path))
        size_kb = round(file_path.stat().st_size / 1024, 2)

        asset_record = {
            "id": asset_id,
            "project_id": project_id,
            "filename": file.filename,
            "stored_path": str(file_path),
            "size_kb": size_kb,
            "created_at": __import__("datetime").datetime.utcnow().isoformat() + "Z"
        }

        upsert("asset", asset_record)

        logger.info(f"Saved asset {file.filename} for project {project_id}")
        return jsonify(asset_record), 201

    except Exception as e:
        logger.error(f"Error uploading asset: {e}")
        return jsonify({"error": str(e)}), 500

# ── List Assets for Project ────────────────────────────────────────────────────
@asset_bp.route("/api/assets", methods=["GET"])
@asset_bp.route("/api/projects/<project_id>/assets", methods=["GET"])
def list_assets(project_id=None):
    if not project_id:
        project_id = request.args.get("project_id", "")
    assets = list_records("asset", project_id=str(project_id) if project_id else None)
    for asset in assets:
        asset["available_locally"] = Path(asset.get("stored_path", "")).is_file()
    return jsonify(assets), 200

# ── Delete Asset ───────────────────────────────────────────────────────────────
@asset_bp.route("/api/assets/<asset_id>", methods=["DELETE"])
def delete_asset(asset_id):
    from utils.local_store import get
    target = get("asset", asset_id)
    if target:
        try:
            path = Path(target.get("stored_path", ""))
            if path.exists():
                path.unlink()
        except Exception as e:
            logger.warning(f"Could not delete asset file: {e}")
    delete("asset", asset_id)
    return jsonify({"success": True}), 200

# ── Serve Screenshots ──────────────────────────────────────────────────────────
@asset_bp.route("/api/screenshots/<filename>", methods=["GET"])
def get_screenshot(filename):
    return send_from_directory(str(SCREENSHOTS_DIR), filename)

# ── Serve Uploaded Videos for UI Preview ───────────────────────────────────────
@asset_bp.route("/api/videos/<filename>", methods=["GET"])
def get_video(filename):
    return send_from_directory(str(VIDEOS_DIR), filename)
    if Path(file.filename).suffix.lower() not in {".mp4", ".mov", ".webm", ".m4v"}:
        return jsonify({"error": "Unsupported video type"}), 400

