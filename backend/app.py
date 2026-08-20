import os
from flask import Flask
from flask_cors import CORS
from config import PORT
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
    CORS(app, resources={r"/api/*": {"origins": "*"}})

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
    app.run(host="0.0.0.0", port=PORT, debug=False)
