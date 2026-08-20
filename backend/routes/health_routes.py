from flask import Blueprint, jsonify

health_bp = Blueprint("health_bp", __name__)

@health_bp.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "ok",
        "service": "qa-ai-platform-backend",
        "version": "2.0.0"
    }), 200
