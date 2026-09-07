import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from utils import local_store
from core.desktop_snapshot import export_workspace,import_workspace,validate_snapshot
from core.desktop_storage import save_test,save_suite

class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.db=patch.object(local_store,'DB_FILE',Path(self.temp.name)/'db');self.db.start();self.addCleanup(self.db.stop)
        local_store.initialize()
        local_store.upsert('project',{'id':'p','name':'Project','project_type':'desktop','user_id':'u'})
        save_test('p',{'name':'Original','steps':[{'action':'fill','target':{'name':'Editor'},'value':'private-fixture'}]},'t')
        save_suite('p',{'name':'Suite','test_ids':['t'],'continue_on_failure':False},'s')
    def test_round_trip_encrypted_backup_and_private_device_state_excluded(self):
        local_store.upsert('credential',{'id':'secret','project_id':'p','value':'not-exported'})
        payload=export_workspace('p','u');self.assertNotIn('not-exported',json.dumps(payload))
        payload['tests'][0]['name']='Changed'
        import_workspace('p','u',payload)
        self.assertEqual(local_store.get('desktop_test','t')['name'],'Changed')
        self.assertEqual(len(local_store.list_records('desktop_backup',project_id='p')),1)
        with local_store._connect() as connection:
            raw=''.join(r[0] for r in connection.execute("SELECT payload FROM records WHERE kind IN ('desktop_test','desktop_backup')"))
        self.assertNotIn('private-fixture',raw)
    def test_foreign_owner_rejected(self):
        with self.assertRaises(ValueError):export_workspace('p','other')
        with self.assertRaises(ValueError):import_workspace('p','other',export_workspace('p','u'))
    def test_invalid_suite_does_not_change_local_data(self):
        payload=export_workspace('p','u');payload['suites'][0]['test_ids']=['missing']
        with self.assertRaises(ValueError):import_workspace('p','u',payload)
        self.assertEqual(local_store.get('desktop_test','t')['name'],'Original')
    def test_protection_failure_is_atomic(self):
        payload=export_workspace('p','u');payload['tests'][0]['name']='Changed'
        with patch('core.desktop_snapshot.protect_steps',side_effect=ValueError('locked')):
            with self.assertRaises(ValueError):import_workspace('p','u',payload)
        self.assertEqual(local_store.get('desktop_test','t')['name'],'Original')
    def test_cross_project_record_collision_rejected(self):
        payload=export_workspace('p','u');payload['tests'][0]['id']='foreign';payload['suites'][0]['test_ids']=['foreign']
        local_store.upsert('desktop_test',{'id':'foreign','project_id':'other','steps':[{'action':'click','target':{'name':'x'}}]})
        with self.assertRaises(ValueError):import_workspace('p','u',payload)
        self.assertEqual(local_store.get('desktop_test','foreign')['project_id'],'other')
    def test_machine_and_input_fields_stripped_from_imported_evidence(self):
        payload=export_workspace('p','u');payload['runs']=[{'id':'r','status':'passed','handle':42,'steps':[{'action':'fill','status':'passed','value':'secret','target':{'name':'private'}}]}]
        clean=validate_snapshot(payload,'p');self.assertNotIn('secret',json.dumps(clean['runs']));self.assertNotIn('handle',clean['runs'][0])
    def test_duplicate_records_rejected(self):
        payload=export_workspace('p','u');payload['tests']*=2
        with self.assertRaises(ValueError):import_workspace('p','u',payload)
