import json
import uuid
import time
from flask import Blueprint, request, jsonify
from config import TESTCASES_DB_FILE
from utils.logger import logger

testcase_bp = Blueprint("testcase_bp", __name__)

DEFAULT_TEST_CASES = []

def load_test_cases():
    if not TESTCASES_DB_FILE.exists():
        save_test_cases(DEFAULT_TEST_CASES)
        return DEFAULT_TEST_CASES
    try:
        with open(TESTCASES_DB_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if data else DEFAULT_TEST_CASES
    except Exception:
        save_test_cases(DEFAULT_TEST_CASES)
        return DEFAULT_TEST_CASES

def save_test_cases(test_cases):
    try:
        with open(TESTCASES_DB_FILE, "w", encoding="utf-8") as f:
            json.dump(test_cases, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to save test cases: {e}")

@testcase_bp.route("/api/testcases", methods=["GET"])
def get_test_cases():
    project_id = request.args.get("project_id")
    all_cases = load_test_cases()
    if project_id:
        filtered = [c for c in all_cases if c.get("project_id") == project_id]
        return jsonify(filtered), 200
    return jsonify(all_cases), 200

@testcase_bp.route("/api/testcases", methods=["POST"])
def create_test_case():
    data = request.json or {}
    project_id = data.get("project_id")
    name = data.get("name")
    commands = data.get("commands", "")

    if not project_id or not name:
        return jsonify({"error": "project_id and name are required"}), 400

    new_tc = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "name": name,
        "type": data.get("type", "txt"),
        "commands": commands,
        "cached_json": data.get("cached_json", None),
        "status": "pending",
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")
    }

    cases = load_test_cases()
    cases.insert(0, new_tc)
    save_test_cases(cases)

    return jsonify(new_tc), 201

@testcase_bp.route("/api/testcases/<tc_id>", methods=["PUT"])
def update_test_case(tc_id):
    data = request.json or {}
    cases = load_test_cases()
    found = None
    for c in cases:
        if c.get("id") == tc_id:
            c["name"] = data.get("name", c["name"])
            c["commands"] = data.get("commands", c["commands"])
            c["cached_json"] = data.get("cached_json", c.get("cached_json"))
            c["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ")
            found = c
            break
    save_test_cases(cases)
    if found:
        return jsonify(found), 200
    return jsonify({"error": "Test case not found"}), 404

@testcase_bp.route("/api/testcases/<tc_id>", methods=["DELETE"])
def delete_test_case(tc_id):
    cases = load_test_cases()
    updated = [c for c in cases if c.get("id") != tc_id]
    save_test_cases(updated)
    return jsonify({"success": True, "message": "Test case deleted"}), 200
