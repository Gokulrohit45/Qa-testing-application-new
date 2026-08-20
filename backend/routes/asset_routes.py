import os
import uuid
from flask import Blueprint, request, jsonify, send_from_directory
from config import VIDEOS_DIR, SCREENSHOTS_DIR
from utils.ffmpeg_helper import convert_mp4_to_y4m
from utils.logger import logger

asset_bp = Blueprint("asset_bp", __name__)

@asset_bp.route("/api/upload-video", methods=["POST"])
def upload_video():
    if "video" not in request.files:
        return jsonify({"error": "No video file provided"}), 400

    file = request.files["video"]
    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    filename_base = str(uuid.uuid4())
    mp4_filename = f"{filename_base}.mp4"
    y4m_filename = f"{filename_base}.y4m"

    mp4_path = VIDEOS_DIR / mp4_filename
    y4m_path = VIDEOS_DIR / y4m_filename

    try:
        file.save(str(mp4_path))
        logger.info(f"Saved uploaded MP4 video to {mp4_path}")

        # Convert MP4 to Y4M 640x480
        success = convert_mp4_to_y4m(str(mp4_path), str(y4m_path))

        return jsonify({
            "success": True,
            "mp4_path": str(mp4_path),
            "y4m_path": str(y4m_path) if success else str(mp4_path),
            "y4m_ready": success
        }), 201

    except Exception as e:
        logger.error(f"Error uploading video: {e}")
        return jsonify({"error": str(e)}), 500

@asset_bp.route("/api/screenshots/<filename>", methods=["GET"])
def get_screenshot(filename):
    return send_from_directory(str(SCREENSHOTS_DIR), filename)
