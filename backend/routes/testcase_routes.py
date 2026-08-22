import time
import uuid
from flask import Blueprint, request, jsonify
from utils.local_store import list_records, upsert, get, delete

testcase_bp = Blueprint("testcase_bp", __name__)

@testcase_bp.route("/api/testcases", methods=["GET"])
def get_test_cases():
    return jsonify(list_records("test_case", user_id=request.args.get("user_id"), project_id=request.args.get("project_id"))), 200

@testcase_bp.route("/api/testcases", methods=["POST"])
def create_test_case():
    data = request.json or {}
    if not data.get("project_id") or not data.get("name") or not data.get("user_id"):
        return jsonify({"error": "project_id, name, and user_id are required"}), 400
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ")
    record = {**data, "id": data.get("id") or str(uuid.uuid4()), "type": data.get("type", "txt"),
        "commands": data.get("commands", ""), "cached_json": data.get("cached_json") or [],
        "status": data.get("status", "pending"), "created_at": data.get("created_at") or now, "updated_at": now}
    upsert("test_case", record)
    return jsonify(record), 201

@testcase_bp.route("/api/testcases/<testcase_id>", methods=["PUT"])
def update_test_case(testcase_id):
    current = get("test_case", testcase_id)
    if not current: return jsonify({"error": "Test case not found"}), 404
    allowed = {"name", "commands", "cached_json", "type", "status", "sync_state"}
    current.update({key: value for key, value in (request.json or {}).items() if key in allowed})
    current["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ")
    upsert("test_case", current)
    return jsonify(current), 200

@testcase_bp.route("/api/testcases/<testcase_id>", methods=["DELETE"])
def delete_test_case(testcase_id):
    if not delete("test_case", testcase_id): return jsonify({"error": "Test case not found"}), 404
    return jsonify({"success": True}), 200
