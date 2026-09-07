import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core.desktop_suite import run_suite

class Adapter:
    def find(self, target): return self
    def read(self, control): return 'actual'
    def perform(self, control, action, value): pass

class SuiteTests(unittest.TestCase):
    def plan(self):
        return [{'id': str(i), 'name': str(i), 'steps': [{'action':'verify_text','target':{'name':'editor'},'value': value,'timeout_seconds':.001}]} for i,value in enumerate(['wrong','actual'])]
    def test_stop_on_failure(self):
        result = run_suite(Adapter(), self.plan())
        self.assertEqual([t['status'] for t in result['tests']], ['failed','blocked'])
    def test_continue_retains_failure(self):
        events = []
        result = run_suite(Adapter(), self.plan(), True, on_step=events.append)
        self.assertEqual(result['status'], 'failed')
        self.assertEqual([t['status'] for t in result['tests']], ['failed','passed'])
        self.assertEqual([s['step_number'] for s in events], [1,2])
    def test_cancel_never_passes(self):
        self.assertEqual(run_suite(Adapter(), self.plan(), stopped=lambda:True)['status'], 'cancelled')
