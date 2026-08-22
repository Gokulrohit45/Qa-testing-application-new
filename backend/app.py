import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from config import PORT, LOCAL_API_TOKEN, CORS_ALLOWED_ORIGINS
from routes.health_routes import health_bp
from routes.project_routes import project_bp
from routes.testcase_routes import testcase_bp
from routes.translate_routes import translate_bp
from routes.execution_routes import execution_bp
from routes.asset_routes import asset_bp
from routes.auth_routes import auth_bp
from utils.logger import logger

def create_app():
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 250 * 1024 * 1024
    CORS(app, resources={r"/api/*": {
        "origins": CORS_ALLOWED_ORIGINS,
        "allow_headers": ["Content-Type", "X-QA-AI-Token"]
    }})

    @app.before_request
    def protect_local_api():
        if request.method == "OPTIONS":
            return None
        supplied_token = request.headers.get("X-QA-AI-Token", "")
        if request.method == "GET" and request.path.startswith(("/api/screenshots/", "/api/videos/")):
            supplied_token = supplied_token or request.args.get("token", "")
        if LOCAL_API_TOKEN and supplied_token != LOCAL_API_TOKEN:
            return jsonify({"error": "Unauthorized local API request"}), 401

    # Register Blueprints
    app.register_blueprint(health_bp)
    app.register_blueprint(project_bp)
    app.register_blueprint(testcase_bp)
    app.register_blueprint(translate_bp)
    app.register_blueprint(execution_bp)
    app.register_blueprint(asset_bp)
    app.register_blueprint(auth_bp)

    logger.info(f"Flask backend initialized. Port: {PORT}")
    return app

app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=PORT, debug=False, threaded=True)
