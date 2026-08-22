import os
import tempfile
import unittest
import sys
import time
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

_TEMP_HOME = tempfile.TemporaryDirectory()
os.environ["QA_AI_DESKTOP"] = "1"
os.environ["LOCAL_API_TOKEN"] = "test-token"
os.environ["USERPROFILE"] = _TEMP_HOME.name
os.environ["HOME"] = _TEMP_HOME.name
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import create_app
from core.playwright_runner import PLAYWRIGHT_AVAILABLE

class _TargetHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = b"<!doctype html><html><body><label>Email<input aria-label='Email'></label><button>Ready</button></body></html>"
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *_args):
        return

class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = create_app().test_client()
        cls.headers = {"X-QA-AI-Token": "test-token"}
        cls.target_server = ThreadingHTTPServer(("127.0.0.1", 0), _TargetHandler)
        cls.target_thread = threading.Thread(target=cls.target_server.serve_forever, daemon=True)
        cls.target_thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.target_server.shutdown()
        cls.target_server.server_close()

    def test_health_requires_token(self):
        self.assertEqual(self.client.get("/api/health").status_code, 401)
        response = self.client.get("/api/health", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertIn("playwright_available", response.get_json())

    def test_project_round_trip_preserves_uuid(self):
        project_id = "35d762e5-3ceb-44cd-b8a2-cb1f8302b91c"
        user_id = "9cf47a8e-4b64-4a32-bb54-5f15314bc612"
        response = self.client.post("/api/projects", headers=self.headers, json={
            "id": project_id, "user_id": user_id, "name": "Example",
            "app_name": "Example", "app_url": "https://example.com"
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json()["id"], project_id)
        listed = self.client.get(f"/api/projects?user_id={user_id}", headers=self.headers).get_json()
        self.assertEqual([item["id"] for item in listed], [project_id])

    def test_invalid_execution_is_rejected(self):
        response = self.client.post("/api/execute", headers=self.headers, json={
            "project_id": "p", "app_url": "https://example.com",
            "steps": [{"action": "arbitrary_code"}]
        })
        self.assertEqual(response.status_code, 400)

    @unittest.skipUnless(PLAYWRIGHT_AVAILABLE, "Playwright not installed")
    def test_real_playwright_execution(self):
        target_url = f"http://127.0.0.1:{self.target_server.server_port}/"
        response = self.client.post("/api/execute", headers=self.headers, json={
            "project_id": "35d762e5-3ceb-44cd-b8a2-cb1f8302b91c",
            "user_id": "9cf47a8e-4b64-4a32-bb54-5f15314bc612",
            "app_url": target_url, "headless": True, "timeout_seconds": 10,
            "steps": [{"action": "verify", "target": "Ready", "value": ""}]
        })
        self.assertEqual(response.status_code, 202)
        execution_id = response.get_json()["execution_id"]
        result = None
        for _ in range(160):
            result = self.client.get(f"/api/executions/{execution_id}/logs", headers=self.headers).get_json()
            if result["status"] in {"Passed", "Failed", "Stopped"}: break
            time.sleep(0.25)
        self.assertEqual(result["status"], "Passed", result.get("error_message"))
        self.assertEqual(len(result["logs"]), 2)

if __name__ == "__main__":
    unittest.main()
