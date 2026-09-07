import sys
import threading
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core import desktop_jobs
from core.desktop_runner import run_steps


class DesktopFailureAndStopTests(unittest.TestCase):
    def test_wrong_expected_text_is_failure(self):
        class Adapter:
            def find(self, target): return self
            def read(self, control): return 'actual'
        result = run_steps(Adapter(), [{'action':'verify_text', 'target':{'control_type':'Document'}, 'value':'wrong', 'timeout_seconds':0.001}])
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['steps'][0]['error_code'], 'TEXT_MISMATCH')
        self.assertIn('recommendation', result['steps'][0])
        self.assertNotIn('actual', str(result))

    def test_stop_preserves_pass_and_marks_unreported(self):
        job = {'status':'cancelled', 'steps':[{'step_number':1, 'action':'fill', 'status':'passed'}]}
        plan = [{'action':'fill'}, {'action':'verify_text'}, {'action':'click'}]
        desktop_jobs.complete_unreported_steps(job, plan)
        desktop_jobs.complete_unreported_steps(job, plan)
        self.assertEqual([s['status'] for s in job['steps']], ['passed','not_completed','not_completed'])
        self.assertIsNone(job['steps'][1]['duration_ms'])

    def test_stop_does_not_rewrite_finished_job(self):
        with desktop_jobs.LOCK:
            desktop_jobs.JOBS['test-stop'] = {'id':'test-stop','status':'passed','steps':[], 'stop':threading.Event()}
        try:
            self.assertTrue(desktop_jobs.stop('test-stop'))
            self.assertEqual(desktop_jobs.snapshot('test-stop')['status'], 'passed')
        finally:
            with desktop_jobs.LOCK: desktop_jobs.JOBS.pop('test-stop')

    def test_stop_signals_worker_and_exposes_stopping(self):
        event = threading.Event()
        with desktop_jobs.LOCK:
            desktop_jobs.JOBS['test-stop'] = {'id':'test-stop','status':'running','steps':[], 'stop':event}
        try:
            self.assertTrue(desktop_jobs.stop('test-stop'))
            self.assertTrue(event.is_set())
            self.assertEqual(desktop_jobs.snapshot('test-stop')['status'], 'stopping')
        finally:
            with desktop_jobs.LOCK: desktop_jobs.JOBS.pop('test-stop')
