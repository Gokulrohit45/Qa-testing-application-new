import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

_DATA = tempfile.TemporaryDirectory()
os.environ['QA_AI_DESKTOP'] = '1'
os.environ.setdefault('QA_AI_DATA_DIR', _DATA.name)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from flask import Flask
from routes.translate_routes import translate_bp, validate_ai_steps


class TranslationTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.register_blueprint(translate_bp)
        self.client = app.test_client()

    def test_known_steps_do_not_require_ai(self):
        with patch('routes.translate_routes.GEMINI_API_KEY', 'not-a-real-key'):
            response = self.client.post('/api/translate', json={'prompt': 'verify Open incidents'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['source'], 'deterministic')
        self.assertEqual(response.json['steps'][0]['action'], 'verify')

    def test_unknown_never_silently_becomes_click(self):
        with patch('routes.translate_routes.GEMINI_API_KEY', ''):
            response = self.client.post('/api/translate', json={'prompt': 'power_on ESP32'})
        self.assertEqual(response.status_code, 422)
        self.assertIn('Step 1', response.json['error'])

    def test_ai_cannot_drop_or_rewrite_recognized_steps(self):
        prompt = 'click Login\nverify Overview'
        with self.assertRaises(ValueError):
            validate_ai_steps([], prompt)
        candidate = [{'action': 'goto', 'target': 'https://example.com', 'value': '', 'raw_command': 'click Login'}, {'action': 'verify', 'target': 'Overview', 'value': '', 'raw_command': 'verify Overview'}]
        with self.assertRaises(ValueError):
            validate_ai_steps(candidate, prompt)

    def test_validate_reports_row_errors_and_warnings(self):
        response = self.client.post('/api/validate', json={'steps': [{'action': 'goto', 'target': 'dashboard'}]})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json['errors'][0]['step'], 1)
        response = self.client.post('/api/validate', json={'steps': [{'action': 'fill', 'target': 'Password', 'value': '{{password}}'}]})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json['warnings'])

    def test_cloud_output_is_validated_locally_and_requires_review(self):
        candidate = [{'action':'click', 'target':'Login', 'value':'', 'raw_command':'click Login'}]
        response = self.client.post('/api/validate-translation', json={'prompt':'click Login','steps':candidate})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json['requires_review'])
        self.assertEqual(response.json['contract_version'], 2)
        candidate[0]['target'] = 'Delete'
        response = self.client.post('/api/validate-translation', json={'prompt':'click Login','steps':candidate})
        self.assertEqual(response.status_code, 422)

    def test_hardware_instruction_cannot_become_browser_click(self):
        candidate = [{'action':'click','target':'ESP32','value':'','raw_command':'power_on ESP32'}]
        with self.assertRaises(ValueError):
            validate_ai_steps(candidate, 'power_on ESP32')


if __name__ == '__main__':
    unittest.main()
