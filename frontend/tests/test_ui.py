"""Run with local fixture server: npm exec vite -- --config tests/vite.config.js."""
import os
import unittest
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

class FrontendIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop()

    def setUp(self):
        self.page = self.browser.new_page(viewport={'width':1440,'height':1100})
        self.errors = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.on('dialog', lambda dialog: dialog.accept())
        self.page.route('**/*', lambda route: route.continue_() if route.request.url.startswith('http://127.0.0.1:5199/') else route.abort())
        self.page.goto('http://127.0.0.1:5199/tests/runner.html')
        self.page.get_by_role('button', name='Upload', exact=True).click()

    def tearDown(self):
        self.assertFalse(self.errors)
        self.page.close()

    def test_csv_preserves_action_and_expectation_without_ai(self):
        content = b'Test Case,Step,Action,Target,Value,Expected Type,Expected Value\nNavigation,1,verify,Open incidents,,,\nNavigation,2,click,Sign In,,text_visible,Overview\n'
        self.page.locator('input[type=file][accept=".txt,.csv"]').set_input_files({'name':'fixture.csv','mimeType':'text/csv','buffer':content})
        expect(self.page.get_by_text('Structured step builder',exact=True)).to_be_visible()
        output = Path(os.environ.get('QA_UI_OUTPUT', '.test-results'))
        output.mkdir(exist_ok=True)
        self.page.screenshot(path=str(output / 'structured-import.png'), full_page=True)
        self.page.locator('button[type=submit]').click()
        self.page.wait_for_function('window.fixture.saved.length === 1')
        saved = self.page.evaluate('window.fixture.saved[0]')
        self.assertEqual(saved['type'], 'structured')
        self.assertEqual(saved['cached_json'][0]['action'], 'verify')
        self.assertEqual(saved['cached_json'][1]['expected_value'], 'Overview')
        self.assertEqual(self.page.evaluate('window.fixture.translations'), 0)

    def test_builder_adds_and_edits_step(self):
        self.page.get_by_role('button', name='New guided test', exact=True).click()
        self.page.get_by_label('Action', exact=True).select_option('verify')
        self.page.get_by_label('Target', exact=True).fill('Open incidents')
        self.page.get_by_role('button', name='Add step', exact=True).click()
        self.page.get_by_role('button', name='Edit', exact=True).click()
        self.page.get_by_label('Target', exact=True).fill('Overview')
        self.page.get_by_role('button', name='Apply step edit', exact=True).click()
        expect(self.page.get_by_text('1. verify — Overview', exact=True)).to_be_visible()

    def test_runtime_variables_reach_runner_without_changing_saved_definition(self):
        content = b'Test Case,Step,Action,Target,Value,Expected Type,Expected Value\nLogin,1,fill,Password,{{test_password}},field_value,{{test_password}}\n'
        self.page.locator('input[type=file][accept=".txt,.csv"]').set_input_files({'name':'variables.csv','mimeType':'text/csv','buffer':content})
        self.page.locator('button[type=submit]').click()
        self.page.wait_for_function('window.fixture.saved.length === 1')
        self.page.get_by_role('button', name='Run Suite', exact=True).last.click()
        self.page.get_by_label('test_password', exact=True).fill('fixture-secret')
        self.page.get_by_role('button', name='Launch Playwright Execution', exact=True).click()
        self.page.wait_for_function('window.fixture.executions.length === 1')
        payload = self.page.evaluate('window.fixture.executions[0]')
        self.assertTrue(payload['structured'])
        self.assertEqual(payload['variables']['test_password'], 'fixture-secret')
        self.assertEqual(payload['steps'][0]['expected_type'], 'field_value')
        saved = self.page.evaluate('window.fixture.saved[0]')
        self.assertEqual(saved['cached_json'][0]['value'], '{{test_password}}')
        self.assertNotIn('fixture-secret', str(saved))

    def test_report_does_not_pass_empty_results(self):
        self.page.get_by_role('button', name='Results', exact=True).click()
        expect(self.page.get_by_text('No results', exact=True)).to_be_visible()
        expect(self.page.get_by_text('UI state healthy', exact=False)).to_have_count(0)
        self.page.get_by_role('button', name='Report', exact=True).click()
        expect(self.page.get_by_text('No results', exact=True)).to_be_visible()
        expect(self.page.get_by_text('0% Rate', exact=True)).to_be_visible()

    def test_video_requires_consent_and_only_creates_review_draft(self):
        button=self.page.get_by_role('button',name='Generate draft',exact=True)
        expect(button).to_be_disabled()
        self.page.get_by_label('Test recording video').set_input_files({'name':'synthetic.webm','mimeType':'video/webm','buffer':b'fixture'})
        expect(button).to_be_disabled()
        self.page.get_by_role('checkbox',name='I authorize sending this test recording').check()
        expect(button).to_be_enabled()
        button.click()
        expect(self.page.get_by_text('Your draft is ready for review')).to_be_visible()
        self.assertEqual(self.page.evaluate('window.fixture.executions.length'),0)

if __name__ == '__main__':
    unittest.main()
