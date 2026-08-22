import os
import uuid
from pathlib import Path
from flask import Blueprint, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from config import VIDEOS_DIR, SCREENSHOTS_DIR, DATA_DIR
from utils.ffmpeg_helper import convert_mp4_to_y4m
from utils.logger import logger
from utils.local_store import list_records, upsert, delete

asset_bp = Blueprint("asset_bp", __name__)

ASSETS_DIR = DATA_DIR / "project_assets"
ASSETS_DIR.mkdir(parents=True, exist_ok=True)

# ── Upload Face Video ──────────────────────────────────────────────────────────
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

    asset_id = str(uuid.uuid4())
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
    return jsonify(list_records("asset", project_id=str(project_id) if project_id else None)), 200

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
