import unittest
from pathlib import Path
from playwright.sync_api import sync_playwright, expect


class DesktopUITests(unittest.TestCase):
    def test_selection_authoring_and_results(self):
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_page(viewport={'width': 1280, 'height': 1000})
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.route('**/*', lambda r: r.continue_() if r.request.url.startswith('http://127.0.0.1:5199/') else r.abort())
            page.goto('http://127.0.0.1:5199/tests/runner.html?desktop=1')
            for label in ['Overview', 'Application', 'Test Cases', 'Project Assets', 'Upload', 'Run Suite', 'History', 'Results', 'Report']:
                expect(page.get_by_role('button', name=label, exact=True)).to_be_visible()

            page.get_by_role('button', name='Run Suite', exact=True).click()
            expect(page.get_by_role('button', name='Run Test', exact=True)).to_be_disabled()
            page.get_by_role('button', name='Refresh running windows').click()
            page.get_by_label('Application window').select_option('123')
            page.get_by_role('button', name='Inspect selected window').click()

            page.get_by_role('button', name='Test Cases', exact=True).click()
            page.get_by_role('button', name='Add Test', exact=True).click()
            expect(page.get_by_role('button', name='Upload', exact=True)).to_be_visible()
            expect(page.get_by_role('button', name='Add step')).to_be_enabled()
            page.get_by_role('button', name='Add step').click()
            page.get_by_label('Step 1 action').select_option('fill')
            page.get_by_label('Step 1 value').fill('sample')
            page.get_by_role('button', name='Add step').click()
            page.get_by_label('Step 2 action').select_option('verify_text')
            page.get_by_label('Step 2 value').fill('sample')
            page.get_by_role('button', name='Save test locally').click()
            expect(page.get_by_text('Test saved.')).to_be_visible()

            page.get_by_role('button', name='Run Suite', exact=True).click()
            expect(page.get_by_role('button', name='Run Test', exact=True)).to_be_disabled()
            page.get_by_role('checkbox', name='I authorize these actions in the selected test window.').check()
            page.get_by_role('button', name='Run Test', exact=True).click()
            expect(page.get_by_text('Step 2: verify_text')).to_be_visible()
            expect(page.get_by_text('Test result: passed', exact=True)).to_be_visible()

            page.get_by_role('button', name='Upload', exact=True).click()
            page.get_by_role('button', name='Save test locally').click()
            expect(page.get_by_text('Test saved.')).to_be_visible()
            page.reload()
            page.get_by_role('button', name='Test Cases', exact=True).click()
            expect(page.get_by_role('heading', name='New desktop test', exact=True)).to_be_visible()
            page.get_by_role('button', name='Edit', exact=True).click()
            expect(page.get_by_label('Step 1 value')).to_have_value('sample')
            expect(page.get_by_label('Step 2 value')).to_have_value('sample')
            page.get_by_label('Test name').fill('Renamed Notepad test')
            page.get_by_role('button', name='Save test locally').click()

            page.reload()
            page.get_by_role('button', name='Run Suite', exact=True).click()
            page.get_by_role('button', name='Create reusable suite', exact=True).click()
            page.get_by_label('Include Renamed Notepad test in suite').check()
            page.get_by_role('button', name='Save suite locally').click()
            expect(page.get_by_text('Suite saved.')).to_be_visible()
            first_suite = page.get_by_label('Saved desktop suite').input_value()
            page.get_by_role('button', name='New suite', exact=True).click()
            page.get_by_label('Suite name', exact=True).fill('Independent checks')
            page.get_by_label('Include Renamed Notepad test in suite').check()
            page.get_by_label('Continue suite after failure').check()
            page.get_by_role('button', name='Save suite locally').click()
            second_suite = page.get_by_label('Saved desktop suite').input_value()
            self.assertNotEqual(first_suite, second_suite)

            page.reload()
            page.get_by_role('button', name='Run Suite', exact=True).click()
            page.get_by_role('button', name='Create reusable suite', exact=True).click()
            page.get_by_label('Saved desktop suite').select_option(first_suite)
            expect(page.get_by_label('Continue suite after failure')).not_to_be_checked()
            page.get_by_label('Saved desktop suite').select_option(second_suite)
            expect(page.get_by_label('Continue suite after failure')).to_be_checked()
            page.get_by_role('button', name='Refresh running windows').click()
            page.get_by_label('Application window').select_option('123')
            page.get_by_role('button', name='Inspect selected window').click()
            authorize = page.get_by_role('checkbox', name='I authorize these actions in the selected test window.')
            authorize.check()
            expect(page.locator('section').filter(has_text='Run and review').get_by_role('button', name='Run Suite', exact=True)).to_be_enabled()
            page.get_by_label('Suite name', exact=True).fill('Renamed suite')
            expect(authorize).not_to_be_checked()
            authorize.check()
            expect(page.locator('section').filter(has_text='Run and review').get_by_role('button', name='Run Suite', exact=True)).to_be_disabled()
            page.once('dialog', lambda dialog: dialog.dismiss())
            page.get_by_label('Saved desktop suite').select_option(first_suite)
            expect(page.get_by_label('Saved desktop suite')).to_have_value(second_suite)
            page.get_by_role('button', name='Save suite locally').click()
            page.locator('section').filter(has_text='Run and review').get_by_role('button', name='Run Suite', exact=True).click()
            expect(page.get_by_text('Test result: passed', exact=True)).to_be_visible()
            execution = page.evaluate('window.fixture.executions.at(-1)')
            self.assertEqual(execution['suite_id'], second_suite)
            self.assertNotIn('suite_ids', execution)

            page.reload()
            page.get_by_role('button', name='Run Suite', exact=True).click()
            page.get_by_role('button', name='Create reusable suite', exact=True).click()
            expect(page.get_by_label('Suite name', exact=True)).to_have_value('Renamed suite')
            self.assertEqual(page.get_by_label('Saved desktop suite').locator('option').count(), 3)
            color = page.locator('h1').evaluate('(el) => getComputedStyle(el).color')
            self.assertNotEqual(color, 'rgb(244, 244, 245)')
            output = Path('.test-results')
            output.mkdir(exist_ok=True)
            page.screenshot(path=str(output / 'desktop-workspace.png'), full_page=True)
            self.assertEqual(errors, [])
            browser.close()


    def test_shared_web_web_and_desktop_visual_system(self):
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            pages = []
            for suffix in ['', '?desktop=1']:
                page = browser.new_page(viewport={'width': 1440, 'height': 1000})
                page.route('**/*', lambda r: r.continue_() if r.request.url.startswith('http://127.0.0.1:5199/') else r.abort())
                page.goto(f'http://127.0.0.1:5199/tests/runner.html{suffix}')
                pages.append(page)
            def styles(page):
                tab = page.get_by_role('button', name='Overview', exact=True)
                card = page.locator('.card').first
                return {
                    'body_font': page.locator('body').evaluate('(e) => getComputedStyle(e).fontFamily'),
                    'tab_font': tab.evaluate('(e) => getComputedStyle(e).fontSize'),
                    'tab_weight': tab.evaluate('(e) => getComputedStyle(e).fontWeight'),
                    'tab_radius': tab.evaluate('(e) => getComputedStyle(e).borderRadius'),
                    'card_radius': card.evaluate('(e) => getComputedStyle(e).borderRadius'),
                }
            self.assertEqual(styles(pages[0]), styles(pages[1]))
            for page in pages:
                page.close()
            browser.close()

if __name__ == '__main__': unittest.main()
