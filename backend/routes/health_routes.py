from flask import Blueprint, jsonify
from core.playwright_runner import PLAYWRIGHT_AVAILABLE
from config import SUPABASE_URL, SUPABASE_ANON_KEY
from core.desktop_jobs import available as desktop_available

health_bp = Blueprint("health_bp", __name__)

@health_bp.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "ok",
        "service": "qa-ai-platform-backend",
        "version": "2.1.0",
        "playwright_available": PLAYWRIGHT_AVAILABLE,
        "capabilities": {
            "test_contract_versions": [2],
            "project_types": ["web", "desktop"],
            "execution_runners": ["web"] if PLAYWRIGHT_AVAILABLE else [],
            "desktop_execution": desktop_available(),
            "recording": False,
            "video_to_test": False
        }
    }), 200

@health_bp.route("/api/public-config", methods=["GET"])
def public_config():
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return jsonify({"error": "Public cloud configuration is unavailable"}), 503
    return jsonify({
        "supabase_url": SUPABASE_URL,
        "supabase_anon_key": SUPABASE_ANON_KEY
    }), 200
