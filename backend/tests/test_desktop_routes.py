import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

_TEMP = tempfile.TemporaryDirectory()
os.environ.setdefault('QA_AI_DATA_DIR', _TEMP.name)
os.environ.setdefault('LOCAL_API_TOKEN', 'test-token')
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app


class DesktopRoutesTests(unittest.TestCase):
    def setUp(self):
        self.client = create_app().test_client()
        self.headers = {'X-QA-AI-Token': 'test-token'}

    def post(self, data):
        return self.client.post('/api/desktop/jobs', headers=self.headers, json=data)

    def test_disabled_by_default(self):
        with patch('core.desktop_jobs.available', return_value=False):
            self.assertEqual(self.post({'kind': 'windows'}).status_code, 503)

    def test_token_required(self):
        self.assertEqual(self.client.post('/api/desktop/jobs', json={'kind': 'windows'}).status_code, 401)

    @patch('core.desktop_jobs.available', return_value=True)
    @patch('core.desktop_jobs.start')
    def test_invalid_operation_does_not_start_worker(self, start, _available):
        for data in [{'kind': 'launch'}, {'kind': 'controls', 'handle': True}, {'kind': 'run', 'handle': 1, 'process_id': 2, 'title': 'Test'}]:
            self.assertEqual(self.post(data).status_code, 400)
        start.assert_not_called()

    @patch('core.desktop_jobs.available', return_value=True)
    @patch('core.desktop_jobs.start', return_value='job-1')
    def test_valid_run_is_queued(self, start, _available):
        data = {'kind': 'run', 'handle': 1, 'process_id': 2, 'title': 'Test', 'confirmed': True,
                'steps': [{'action': 'verify_text', 'target': {'control_type': 'Edit'}, 'value': 'sample'}]}
        response = self.post(data)
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.get_json()['id'], 'job-1')
        start.assert_called_once()

    @patch('core.desktop_jobs.available', return_value=True)
    def test_missing_job_is_404(self, _available):
        self.assertEqual(self.client.get('/api/desktop/jobs/missing', headers=self.headers).status_code, 404)

    @patch('core.desktop_jobs.available', return_value=True)
    @patch('core.desktop_storage.project', return_value={'user_id':'u'})
    @patch('routes.desktop_routes.local_store.get')
    @patch('routes.desktop_routes.local_store.upsert', side_effect=lambda kind, data:data)
    def test_suite_save_validates_membership_and_policy(self, save, get, _project, _available):
        get.return_value = {'project_id':'p','steps':[{'action':'click'}]}
        url = '/api/desktop/projects/p/suite'
        response = self.client.put(url, headers=self.headers, json={'test_ids':['a','b'],'continue_on_failure':True})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['test_ids'], ['a','b'])
        self.assertNotIn('confirmed', response.get_json())
        for data in ({'test_ids':['a','a']}, {'test_ids':['a'],'continue_on_failure':'yes'}, {'test_ids':[]}):
            self.assertEqual(self.client.put(url, headers=self.headers, json=data).status_code, 400)
        get.return_value = {'project_id':'other','steps':[]}
        self.assertEqual(self.client.put(url, headers=self.headers, json={'test_ids':['a']}).status_code, 400)

    @patch('core.desktop_jobs.available', return_value=True)
    @patch('core.desktop_storage.project', return_value={'user_id':'u'})
    @patch('core.desktop_storage.save_suite', side_effect=lambda project_id, data, suite_id=None: {'id':suite_id,'project_id':project_id,**data})
    def test_named_suite_create_update_and_delete_are_scoped(self, _save, _project, _available):
        created = self.client.post('/api/desktop/projects/p/suites', headers=self.headers, json={'name':'Smoke','test_ids':['a']})
        self.assertEqual(created.status_code, 200)
        suite_id = created.get_json()['id']
        with patch('routes.desktop_routes.local_store.get', return_value={'id':suite_id,'project_id':'p'}):
            updated = self.client.put(f'/api/desktop/projects/p/suites/{suite_id}', headers=self.headers, json={'name':'Updated','test_ids':['a']})
            removed = self.client.delete(f'/api/desktop/projects/p/suites/{suite_id}', headers=self.headers)
        self.assertEqual(updated.get_json()['name'], 'Updated')
        self.assertEqual(removed.status_code, 200)

    @patch('core.desktop_jobs.available', return_value=True)
    @patch('core.desktop_storage.project', return_value={'user_id':'u'})
    def test_named_test_delete_is_project_scoped(self, _project, _available):
        with patch('routes.desktop_routes.local_store.get', return_value={'id':'test','project_id':'p'}), patch('routes.desktop_routes.local_store.delete') as delete:
            response = self.client.delete('/api/desktop/projects/p/tests/test', headers=self.headers)
        self.assertEqual(response.status_code, 200)
        delete.assert_called_once_with('desktop_test', 'test')
        with patch('routes.desktop_routes.local_store.get', return_value={'id':'test','project_id':'other'}):
            response = self.client.delete('/api/desktop/projects/p/tests/test', headers=self.headers)
        self.assertEqual(response.status_code, 404)
