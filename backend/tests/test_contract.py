import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core.test_contract import parse_commands, normalize_steps, validate_steps, resolve_variables


class ContractTests(unittest.TestCase):
    def test_action_words_inside_targets_are_not_commands(self):
        for command, action, target in [
            ('verify Open incidents', 'verify', 'Open incidents'),
            ('click Open report', 'click', 'Open report'),
            ('verify input enabled', 'verify', 'input enabled'),
            ('fill Password with open upload_file click', 'fill', 'Password'),
            ('verify upload file', 'verify', 'upload file'),
        ]:
            with self.subTest(command=command):
                step = normalize_steps(parse_commands(command))[0]
                self.assertEqual((step['action'], step['target']), (action, target))

    def test_navigation_and_verify_aliases(self):
        for verb in ['open', 'goto', 'Navigate to', 'visit']:
            self.assertEqual(parse_commands(verb + ' https://example.com/')[0]['target'], 'https://example.com/')
        self.assertEqual(parse_commands('verify_text Welcome')[0]['target'], 'Welcome')

    def test_unknown_is_not_a_click(self):
        steps = parse_commands('power_on ESP32\nlogin with administrator\nselect Font')
        self.assertTrue(all(s['action'] == 'unsupported' for s in steps))
        self.assertEqual(len(validate_steps(steps)[0]), 3)

    def test_wait_units(self):
        self.assertEqual(parse_commands('wait 120 seconds')[0]['value'], '120000')
        self.assertEqual(parse_commands('wait 1.5 seconds')[0]['value'], '1500')
        self.assertEqual(parse_commands('wait 500 ms')[0]['value'], '500')
        self.assertTrue(validate_steps(parse_commands('wait Dashboard'))[0])

    def test_legacy_upload_only_repaired_when_command_starts_with_upload(self):
        raw = 'upload_file "file" using "sales.xlsx"'
        steps = normalize_steps([{'action': 'click', 'target': raw, 'raw_command': raw}])
        self.assertEqual(steps[0]['value'], 'sales.xlsx')
        self.assertEqual(steps[0]['action'], 'upload_file')

    def test_invalid_steps_cannot_disappear(self):
        self.assertEqual(len(normalize_steps([None, {'action': 'goto', 'target': 'dashboard'}])), 2)
        self.assertEqual(len(validate_steps(normalize_steps([None, {'action': 'goto', 'target': 'dashboard'}]))[0]), 2)

    def test_expected_contract_and_dependencies(self):
        steps = [{'action': 'click', 'target': 'Login', 'expected_type': 'text_visible', 'expected_value': 'Overview'},
                 {'action': 'verify', 'target': 'Devices', 'depends_on': [1]}]
        self.assertFalse(validate_steps(steps)[0])
        steps[1]['depends_on'] = [2]
        self.assertTrue(validate_steps(steps)[0])
        steps[0]['expected_type'] = 'works properly'
        self.assertTrue(validate_steps(steps)[0])

    def test_runtime_variables_do_not_mutate_saved_test(self):
        steps = [{'action': 'fill', 'target': 'Password', 'value': '{{password}}'}]
        self.assertFalse(validate_steps(steps, allow_variables=True)[0])
        self.assertTrue(validate_steps(steps)[0])
        with self.assertRaises(ValueError):
            resolve_variables(steps, {})
        resolved = resolve_variables(steps, {'password': 'test-only'})
        self.assertEqual(resolved[0]['value'], 'test-only')
        self.assertEqual(steps[0]['value'], '{{password}}')
        self.assertTrue(resolved[0]['sensitive'])

    def test_no_assertion_warning_and_bad_wait(self):
        self.assertTrue(validate_steps([{'action': 'click', 'target': 'Login'}])[1])
        for value in ['NaN', '-1', 'Infinity', '300001']:
            self.assertTrue(validate_steps([{'action': 'wait', 'value': value}])[0])


if __name__ == '__main__':
    unittest.main()
