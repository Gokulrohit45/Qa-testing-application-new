import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core.project_contract import normalize_project


class ProjectContractTests(unittest.TestCase):
    def test_existing_web_defaults(self):
        result = normalize_project(dict(name="Old", user_id="u", app_url="https://example.com"))
        self.assertEqual(result["project_type"], "web")

    def test_desktop_needs_no_fake_url(self):
        result = normalize_project(dict(name="Desktop", user_id="u", project_type="desktop"))
        self.assertIsNone(result["app_url"])

    def test_invalid_web_url(self):
        with self.assertRaises(ValueError):
            normalize_project(dict(name="Web", user_id="u", app_url="calc.exe"))

    def test_unsupported_platform(self):
        with self.assertRaises(ValueError):
            normalize_project(dict(name="App", user_id="u", project_type="mobile"))

    def test_desktop_webcam_not_claimed(self):
        with self.assertRaises(ValueError):
            normalize_project(dict(name="App", user_id="u", project_type="desktop", face_auth_enabled=True))
