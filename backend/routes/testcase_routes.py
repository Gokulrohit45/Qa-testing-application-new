import time
import uuid
from flask import Blueprint, request, jsonify
from utils.local_store import list_records, upsert, get, delete
from core.test_contract import normalize_steps, validate_steps


def checked_definition(data):
    if "cached_json" not in data or data["cached_json"] == []:
        return None
    steps = normalize_steps(data["cached_json"])
    errors, _ = validate_steps(steps, allow_variables=True)
    if errors:
        return jsonify({"error": " ".join(f"Step {e['step']}: {e['message']}" for e in errors), "errors": errors}), 422
    data["cached_json"] = steps
    return None

testcase_bp = Blueprint("testcase_bp", __name__)

@testcase_bp.route("/api/testcases", methods=["GET"])
def get_test_cases():
    return jsonify(list_records("test_case", user_id=request.args.get("user_id"), project_id=request.args.get("project_id"))), 200

@testcase_bp.route("/api/testcases", methods=["POST"])
def create_test_case():
    data = request.json or {}
    if not data.get("project_id") or not data.get("name") or not data.get("user_id"):
        return jsonify({"error": "project_id, name, and user_id are required"}), 400
    invalid = checked_definition(data)
    if invalid:
        return invalid
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
    data = request.json or {}
    invalid = checked_definition(data)
    if invalid:
        return invalid
    allowed = {"name", "commands", "cached_json", "type", "status", "sync_state"}
    current.update({key: value for key, value in data.items() if key in allowed})
    current["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ")
    upsert("test_case", current)
    return jsonify(current), 200

@testcase_bp.route("/api/testcases/<testcase_id>", methods=["DELETE"])
def delete_test_case(testcase_id):
    if not delete("test_case", testcase_id): return jsonify({"error": "Test case not found"}), 404
    return jsonify({"success": True}), 200
