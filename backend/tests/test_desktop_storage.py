import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

_TEMP = tempfile.TemporaryDirectory()
os.environ.setdefault('QA_AI_DATA_DIR', _TEMP.name)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from utils import local_store
from core import desktop_storage


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.patch = patch.object(local_store, 'DB_FILE', Path(self.temp.name) / 'test.db')
        self.patch.start()
        local_store.initialize()
        local_store.upsert('project', {'id': 'p', 'project_type': 'desktop', 'user_id': 'u'})

    def tearDown(self):
        self.patch.stop()
        self.temp.cleanup()

    def test_saved_steps_survive_connection_reopen_without_window_identity(self):
        steps = [{'action': 'fill', 'target': {'control_type': 'Document'}, 'value': 'sample'}]
        desktop_storage.save_test('p', {'steps': steps, 'handle': 123, 'confirmed': True})
        stored = local_store.get('desktop_test', 'p')
        self.assertEqual(stored['steps'], steps)
        self.assertNotIn('handle', stored)
        self.assertNotIn('confirmed', stored)
        desktop_storage.save_test('p', {'steps': [dict(steps[0], value='changed')]})
        self.assertEqual(len(local_store.list_records('desktop_test', project_id='p')), 1)

    def test_disk_payload_is_protected_and_legacy_readable(self):
        import json
        steps = [{'action':'fill','target':{'name':'Editor'},'value':'private-test-value-123'}]
        desktop_storage.save_test('p', {'steps':steps})
        with local_store._connect() as connection:
            payload = connection.execute("SELECT payload FROM records WHERE kind='desktop_test'").fetchone()['payload']
        self.assertNotIn('private-test-value-123', payload)
        self.assertIn('protected_steps', json.loads(payload))
        self.assertEqual(local_store.get('desktop_test','p')['steps'], steps)
        legacy = dict(local_store.get('desktop_test', 'p'))
        with local_store._connect() as connection:
            connection.execute("UPDATE records SET payload=? WHERE kind='desktop_test' AND id='p'", (json.dumps(legacy),))
        self.assertEqual(local_store.get('desktop_test', 'p')['steps'], steps)
        desktop_storage.save_test('p', {'steps': steps})
        with local_store._connect() as connection:
            payload = connection.execute("SELECT payload FROM records WHERE kind='desktop_test' AND id='p'").fetchone()['payload']
        self.assertNotIn('private-test-value-123', payload)

    def test_encryption_failure_preserves_previous_saved_test(self):
        steps = [{'action': 'fill', 'target': {'name': 'Editor'}, 'value': 'before'}]
        desktop_storage.save_test('p', {'steps': steps})
        with patch('win32crypt.CryptProtectData', side_effect=RuntimeError('dummy failure')):
            with self.assertRaisesRegex(ValueError, 'Nothing was saved'):
                desktop_storage.save_test('p', {'steps': [dict(steps[0], value='after')]})
        self.assertEqual(local_store.get('desktop_test', 'p')['steps'], steps)

    def test_reject_invalid_or_non_desktop_project(self):
        with self.assertRaises(ValueError): desktop_storage.save_test('missing', {'steps': []})
        with self.assertRaises(ValueError): desktop_storage.save_test('p', {'steps': []})

    def test_multiple_named_tests_preserve_legacy(self):
        data = {'steps': [{'action': 'click', 'target': {'name': 'Test'}}]}
        desktop_storage.save_test('p', data)
        desktop_storage.save_test('p', dict(data, name='Second'), 'second')
        desktop_storage.save_test('p', dict(data, name='Renamed'), 'second')
        self.assertEqual(len(local_store.list_records('desktop_test', project_id='p')), 2)
        self.assertEqual(local_store.get('desktop_test', 'second')['name'], 'Renamed')
        self.assertEqual(local_store.get('desktop_test', 'p')['name'], 'Saved desktop test')

    def test_duplicate_names_are_rejected_case_insensitively(self):
        data = {'steps': [{'action': 'click', 'target': {'name': 'Test'}}]}
        desktop_storage.save_test('p', dict(data, name='Calculator smoke'), 'first')
        with self.assertRaisesRegex(ValueError, 'already exists'):
            desktop_storage.save_test('p', dict(data, name=' calculator SMOKE '), 'second')
    def test_cross_project_overwrite_and_bad_names_refused(self):
        data = {'steps': [{'action': 'click', 'target': {'name': 'Test'}}]}
        desktop_storage.save_test('p', data, 'test')
        local_store.upsert('project', {'id': 'other', 'project_type': 'desktop'})
        with self.assertRaises(ValueError): desktop_storage.save_test('other', data, 'test')
        for name in (' ', 'x' * 121, None):
            with self.assertRaises(ValueError): desktop_storage.save_test('p', dict(data, name=name), 'test')

    def test_run_excludes_input_and_cascades_with_project(self):
        desktop_storage.save_run({'id': 'r', 'status': 'passed', 'steps': [], 'value': 'secret', 'handle': 42}, 'p')
        record = local_store.get('desktop_run', 'r')
        self.assertNotIn('value', record)
        self.assertNotIn('handle', record)
        local_store.delete_project_tree('p')
        self.assertIsNone(local_store.get('desktop_run', 'r'))

    def test_multiple_named_suites_preserve_order_and_legacy(self):
        step = {'action': 'click', 'target': {'name': 'Test'}}
        desktop_storage.save_test('p', {'name': 'A', 'steps': [step]}, 'a')
        desktop_storage.save_test('p', {'name': 'B', 'steps': [step]}, 'b')
        desktop_storage.save_suite('p', {'test_ids': ['a'], 'continue_on_failure': False})
        desktop_storage.save_suite('p', {'name': 'Regression', 'test_ids': ['b', 'a'], 'continue_on_failure': True}, 'suite-2')
        desktop_storage.save_suite('p', {'name': 'Renamed', 'test_ids': ['a', 'b'], 'continue_on_failure': False}, 'suite-2')
        records = local_store.list_records('desktop_suite', project_id='p')
        self.assertEqual(len(records), 2)
        self.assertEqual(local_store.get('desktop_suite', 'p')['name'], 'Saved desktop suite')
        self.assertEqual(local_store.get('desktop_suite', 'suite-2')['test_ids'], ['a', 'b'])
        self.assertEqual(local_store.get('desktop_suite', 'suite-2')['name'], 'Renamed')

    def test_suite_rejects_cross_project_tests_and_bad_names(self):
        desktop_storage.save_test('p', {'steps': [{'action': 'click', 'target': {'name': 'Test'}}]}, 'a')
        local_store.upsert('project', {'id': 'other', 'project_type': 'desktop'})
        desktop_storage.save_test('other', {'steps': [{'action': 'click', 'target': {'name': 'Test'}}]}, 'other-test')
        with self.assertRaises(ValueError): desktop_storage.save_suite('p', {'test_ids': ['other-test']}, 'suite')
        with self.assertRaises(ValueError): desktop_storage.save_suite('p', {'name': ' ', 'test_ids': ['a']}, 'suite')
