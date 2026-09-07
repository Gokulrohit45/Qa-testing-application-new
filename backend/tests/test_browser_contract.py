"""Real Chromium regression tests against an isolated, deterministic local page."""
import os
import sys
import tempfile
import threading
import time
import unittest
import uuid
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

_DATA = tempfile.TemporaryDirectory()
os.environ.setdefault('QA_AI_DATA_DIR', _DATA.name)
os.environ['QA_AI_DESKTOP'] = '1'
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from playwright.sync_api import sync_playwright
from core.smart_selectors import smart_click, smart_fill, smart_select
from core.assertions import check_outcome, OutcomeError
from core.test_contract import resolve_variables
from core.playwright_runner import run_playwright_test, EXECUTION_LOGS_CACHE, EXECUTION_STATUS_CACHE

HTML = b'''<!doctype html><html><body>
<h1>Sign In</h1><label>Email address<input type="email"></label>
<label>Password<input type="password"></label>
<button onclick="document.querySelector('h1').textContent='Overview'">Sign In</button>
<button disabled>Disabled control</button><button>Duplicate</button><button>Duplicate</button>
<label>Font<select><option>Inter</option><option>Times New Roman</option></select></label>
<input type="file" hidden id="upload"><span hidden>Hidden success</span>
<button onclick="setTimeout(()=>document.querySelector('#async').textContent='Open incidents', 150)">Load incidents</button><p id="async"></p>
</body></html>'''


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        self.wfile.write(HTML)
    def log_message(self, *_args):
        pass


class BrowserContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}/'
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.page = self.browser.new_page()
        self.page.goto(self.url)

    def tearDown(self):
        self.page.close()

    def test_login_outcome_and_field_checks(self):
        smart_fill(self.page, 'Email address', 'qa@example.com', 1000)
        smart_fill(self.page, 'Password', 'test-only', 1000)
        check_outcome(self.page, {'target': 'Email address', 'expected_type': 'field_value', 'expected_value': 'qa@example.com'}, 1000)
        smart_click(self.page, 'Sign In', 1000)
        check_outcome(self.page, {'target': 'Overview'}, 1000)

    def test_hidden_source_text_cannot_pass(self):
        with self.assertRaises(OutcomeError):
            check_outcome(self.page, {'target': 'Hidden success'}, 200)

    def test_ambiguous_click_fails_fast(self):
        started = time.monotonic()
        with self.assertRaisesRegex(RuntimeError, 'Ambiguous'):
            smart_click(self.page, 'Duplicate', 800)
        self.assertLess(time.monotonic() - started, 2)

    def test_disabled_click_budget(self):
        started = time.monotonic()
        with self.assertRaises(RuntimeError):
            smart_click(self.page, 'Disabled control', 400)
        self.assertLess(time.monotonic() - started, 2)

    def test_native_select_and_delayed_verification(self):
        smart_select(self.page, 'Font', 'Times New Roman', 1000)
        check_outcome(self.page, {'target': 'Font', 'expected_type': 'selected_option', 'expected_value': 'Times New Roman'}, 1000)
        smart_click(self.page, 'Load incidents', 1000)
        check_outcome(self.page, {'target': 'Open incidents'}, 1000)

    def test_element_and_url_conditions(self):
        for kind, target, value in [('element_visible', 'Sign In', ''), ('element_disabled', 'Disabled control', ''), ('element_enabled', 'Sign In', ''), ('element_hidden', 'css:#nonexistent', ''), ('url_equals', '', self.url), ('url_contains', '', '127.0.0.1')]:
            check_outcome(self.page, {'target': target, 'expected_type': kind, 'expected_value': value}, 500)
        with self.assertRaises(OutcomeError):
            check_outcome(self.page, {'target': 'css:button', 'expected_type': 'element_hidden'}, 100)

    def execute(self, steps):
        # Runner owns its own synchronous Playwright context; run outside this thread's loop.
        execution_id = str(uuid.uuid4())
        worker = threading.Thread(target=run_playwright_test, kwargs={'execution_id': execution_id,
            'app_url': self.url, 'steps': steps, 'timeout_seconds': 3,
            'expected_step_count': len(steps) if steps[0]['action'] == 'goto' else len(steps)+1})
        worker.start(); worker.join(30)
        self.assertFalse(worker.is_alive(), 'Runner exceeded test deadline')
        return EXECUTION_STATUS_CACHE[execution_id], EXECUTION_LOGS_CACHE[execution_id]

    def test_runner_preserves_first_navigation_assertion(self):
        status, logs = self.execute([{'action': 'goto', 'target': self.url, 'expected_type': 'text_visible', 'expected_value': 'Sign In'}, {'action': 'click', 'target': 'Sign In', 'expected_type': 'text_visible', 'expected_value': 'Overview'}])
        self.assertEqual(status['status'], 'Passed', status)
        self.assertEqual(len(logs), 2)
        self.assertTrue(all(s['assertion_status'] == 'passed' for s in logs))

    def test_single_failed_navigation_assertion_is_not_duplicated(self):
        status, logs = self.execute([{'action':'goto', 'target':self.url, 'expected_type':'text_visible', 'expected_value':'Missing'}])
        self.assertEqual(status['status'], 'Failed')
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0]['assertion_status'], 'failed')

    def test_runner_failed_assertion_blocks_only_explicit_dependents(self):
        status, logs = self.execute([{'action': 'click', 'target': 'Sign In', 'expected_type': 'text_visible', 'expected_value': 'Missing'},
            {'action': 'click', 'target': 'Load incidents', 'depends_on': [1]},
            {'action': 'verify', 'target': 'Overview'}])
        self.assertEqual(status['status'], 'Failed')
        self.assertEqual([s['status'] for s in logs], ['passed', 'failed', 'skipped', 'passed'])
        self.assertTrue(logs[1]['action_completed'])
        self.assertEqual(logs[1]['assertion_status'], 'failed')
        self.assertTrue(logs[1]['observed'])

    def test_runner_critical_step_blocks_remaining(self):
        status, logs = self.execute([{'action': 'verify', 'target': 'Missing', 'critical': True}, {'action': 'click', 'target': 'Sign In'}])
        self.assertEqual(status['status'], 'Failed')
        self.assertEqual(logs[-1]['status'], 'skipped')

    def test_runner_upload_and_secret_redaction(self):
        file = Path(_DATA.name) / 'test.txt'
        file.write_text('test fixture', encoding='utf-8')
        status, logs = self.execute([{'action': 'upload_file', 'target': '#upload', 'value': str(file)}, {'action': 'fill', 'target': 'Password', 'value': 'do-not-log', 'expected_type': 'field_value', 'expected_value': 'do-not-log'}])
        self.assertEqual(status['status'], 'Passed', status)
        self.assertNotIn('do-not-log', str(logs))

    def test_runtime_target_and_failure_are_redacted(self):
        steps = resolve_variables([{'action':'verify','target':'{{private_text}}'}], {'private_text':'private-fixture-text'})
        status, logs = self.execute(steps)
        self.assertEqual(status['status'], 'Failed')
        self.assertNotIn('private-fixture-text', str(logs))
        self.assertNotIn('private-fixture-text', str(status))


if __name__ == '__main__':
    unittest.main()
