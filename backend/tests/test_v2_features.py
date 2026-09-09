import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from utils import local_store
from core import credential_vault as vault
from core.web_recorder import clean_event, SCRIPT
from routes.video_draft_routes import analyze_video, parse_video_candidate, validate_draft

class VaultTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        patcher=patch.object(local_store,'DB_FILE',Path(self.temp.name)/'db');patcher.start();self.addCleanup(patcher.stop)
        local_store.initialize()
        local_store.upsert('project',{'id':'p','user_id':'u','project_type':'desktop'})
    def test_secret_encrypted_and_listing_write_only(self):
        secret='Synthetic-private-value-482'
        self.assertEqual(vault.save('p','u','password',secret),{'name':'password','configured':True})
        self.assertNotIn(secret,json.dumps(local_store.list_records('credential')))
        self.assertNotIn(secret,json.dumps(vault.names('p','u')))
        self.assertEqual(vault.values('p','u')['password'],secret)
    def test_foreign_owner_cannot_read_or_write(self):
        for function,args in [(vault.save,('p','other','x','value')),(vault.values,('p','other')),(vault.names,('p','other'))]:
            with self.assertRaises(ValueError):function(*args)
    def test_missing_variable_fails_without_mutating_saved_steps(self):
        steps=[{'action':'fill','target':{'name':'Password'},'value':'{{password}}'}]
        with self.assertRaises(ValueError):vault.resolve_desktop(steps,{})
        self.assertEqual(vault.resolve_desktop(steps,{'password':'fixture'})[0]['value'],'fixture')
        self.assertEqual(steps[0]['value'],'{{password}}')
    def test_encryption_failure_does_not_overwrite(self):
        vault.save('p','u','password','original')
        with patch('core.credential_vault.protect_steps',side_effect=ValueError('unavailable')):
            with self.assertRaises(ValueError):vault.save('p','u','password','changed')
        self.assertEqual(vault.values('p','u')['password'],'original')

class DraftTests(unittest.TestCase):
    def test_recorded_password_is_placeholder(self):
        result=clean_event({'action':'fill','target':'label:Password','value':'private'})
        self.assertEqual(result['value'],'{{test_password}}')
    def test_recorder_rejects_unsupported_or_oversized_actions(self):
        for event in [{'action':'execute','target':'x'},{'action':'fill','target':'x','value':'x'*5001}]:
            with self.assertRaises(ValueError):clean_event(event)
    def test_ai_draft_never_returns_runtime_fields_or_password(self):
        result=validate_draft({'steps':[{'action':'fill','target':{'name':'Password'},'value':'private','handle':99}]},'desktop')
        self.assertTrue(result['requires_review'])
        self.assertNotIn('private',json.dumps(result))
        self.assertNotIn('handle',result['steps'][0])
    def test_ai_draft_repairs_unambiguous_navigation_value(self):
        result=validate_draft({'steps':[{'action':'goto','target':'url','value':'https://example.com'}]},'web')
        self.assertEqual(result['steps'][0],{'action':'goto','target':'https://example.com','value':''})

    def test_video_candidate_repairs_fences_arrays_and_action_aliases(self):
        candidate=parse_video_candidate('```json\n[{"type":"navigate","selector":"https://example.com"},{"action":"tap","element":"Sign In"}]\n```')
        result=validate_draft(candidate,'web')
        self.assertEqual([step['action'] for step in result['steps']],['goto','click'])
        self.assertEqual(result['steps'][1]['target'],'Sign In')

    def test_invalid_first_video_response_is_retried_once(self):
        invalid=Mock(status_code=200);invalid.json.return_value={'candidates':[{'content':{'parts':[{'text':'not json'}]}}]}
        valid=Mock(status_code=200);valid.json.return_value={'candidates':[{'content':{'parts':[{'text':json.dumps({'steps':[{'action':'verify','target':'Dashboard','value':''}]})}]}}]}
        with patch('routes.video_draft_routes.GEMINI_API_KEY','fixture-key'), patch('routes.video_draft_routes.requests.post',side_effect=[invalid,valid]) as post:
            result=analyze_video(b'small','video/mp4','web','https://example.com','gemini-fixture')
        self.assertTrue(result['requires_review'])
        self.assertEqual(post.call_count,2)
    def test_ai_draft_rejects_invalid_actions(self):
        with self.assertRaises(ValueError):validate_draft({'steps':[{'action':'shell','target':{'name':'x'}}]},'desktop')

    def test_large_video_uses_provider_file_and_deletes_it(self):
        start=Mock(status_code=200,headers={'X-Goog-Upload-URL':'https://upload.invalid/session'})
        uploaded=Mock(status_code=200);uploaded.json.return_value={'file':{'name':'files/fixture','uri':'https://files.invalid/fixture','state':'ACTIVE'}}
        generated=Mock(status_code=200);generated.json.return_value={'candidates':[{'content':{'parts':[{'text':json.dumps({'steps':[{'action':'click','target':{'name':'Save','control_type':'Button'},'value':''}]})}]}}]}
        with patch('routes.video_draft_routes.INLINE_VIDEO_BYTES',1), patch('routes.video_draft_routes.GEMINI_API_KEY','fixture-key'), patch('routes.video_draft_routes.requests.post',side_effect=[start,uploaded,generated]) as post, patch('routes.video_draft_routes.requests.delete') as delete:
            result=analyze_video(b'large-fixture','video/mp4','desktop','', 'gemini-fixture')
        self.assertTrue(result['requires_review'])
        self.assertIn('fileData',post.call_args_list[2].kwargs['json']['contents'][0]['parts'][1])
        delete.assert_called_once()

    def test_small_video_remains_inline(self):
        generated=Mock(status_code=200);generated.json.return_value={'candidates':[{'content':{'parts':[{'text':json.dumps({'steps':[{'action':'click','target':{'name':'Save','control_type':'Button'},'value':''}]})}]}}]}
        with patch('routes.video_draft_routes.GEMINI_API_KEY','fixture-key'), patch('routes.video_draft_routes.requests.post',return_value=generated) as post, patch('routes.video_draft_routes.requests.delete') as delete:
            analyze_video(b'small','video/mp4','desktop','', 'gemini-fixture')
        self.assertIn('inlineData',post.call_args.kwargs['json']['contents'][0]['parts'][1])
        delete.assert_not_called()
class RecorderBrowserTests(unittest.TestCase):
    def test_recorder_prefers_button_name_before_css_id(self):
        self.assertLess(SCRIPT.index("el.tagName==='BUTTON'"),SCRIPT.index("if(el.id)"))
    def test_real_browser_records_inputs_without_password_values(self):
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser=pw.chromium.launch(headless=True)
            try:
                page=browser.new_page();events=[]
                page.expose_function('__qaRecord',lambda value:events.append(clean_event(value)))
                page.set_content('<label>Email<input id="email"></label><label>Password<input type="password"></label><label>Plan<select><option>Basic</option><option>Pro</option></select></label><button>Continue</button>')
                page.evaluate(SCRIPT)
                page.get_by_label('Email').fill('fixture@example.invalid')
                page.get_by_label('Password').fill('synthetic-password-839')
                page.get_by_label('Plan').focus()
                page.get_by_label('Plan').press('ArrowDown')
                page.get_by_label('Plan').press('Tab')
                page.get_by_role('button',name='Continue').click()
                page.wait_for_timeout(100)
                self.assertTrue(any(e['action']=='click' for e in events))
                self.assertTrue(any(e['action']=='select' and e['value']=='Pro' for e in events))
                self.assertTrue(any(e['value']=='{{test_password}}' for e in events))
                self.assertNotIn('synthetic-password-839',json.dumps(events))
            finally:browser.close()

if __name__=='__main__':unittest.main()
