import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core.desktop_runner import WindowsAdapter, run_steps, validate_steps, UnsupportedControl


class ControlsTests(unittest.TestCase):
    def setUp(self):
        self.adapter = WindowsAdapter.__new__(WindowsAdapter)

    def test_supported_contract(self):
        for action in ('verify_visible', 'verify_enabled', 'verify_checked', 'check', 'uncheck', 'select', 'expand', 'collapse'):
            validate_steps([{'action': action, 'target': {'automation_id': 'test'}}])

    def test_checkbox_is_idempotent(self):
        pattern = SimpleNamespace(CurrentToggleState=0)
        pattern.Toggle = Mock(side_effect=lambda: setattr(pattern, 'CurrentToggleState', 1))
        c = SimpleNamespace(is_enabled=lambda: True, iface_toggle=pattern)
        self.adapter.perform(c, 'check', '')
        self.adapter.perform(c, 'check', '')
        pattern.Toggle.assert_called_once()
        self.assertTrue(self.adapter.check(c, 'verify_checked'))

    def test_indeterminate_is_not_toggled(self):
        p = SimpleNamespace(CurrentToggleState=2, Toggle=Mock())
        with self.assertRaises(UnsupportedControl):
            self.adapter.perform(SimpleNamespace(is_enabled=lambda: True, iface_toggle=p), 'check', '')
        p.Toggle.assert_not_called()

    def test_selection_expand_collapse(self):
        c = SimpleNamespace(is_enabled=lambda: True, iface_selection_item=Mock(), iface_expand_collapse=Mock())
        for action in ('select', 'expand', 'collapse'): self.adapter.perform(c, action, '')
        c.iface_selection_item.Select.assert_called_once()
        c.iface_expand_collapse.Expand.assert_called_once()
        c.iface_expand_collapse.Collapse.assert_called_once()

    def test_missing_pattern_reports_unsupported(self):
        self.adapter.find = lambda _: SimpleNamespace(is_enabled=lambda: True)
        result = run_steps(self.adapter, [{'action': 'check', 'target': {'name': 'test'}}])
        self.assertEqual(result['steps'][0]['error_code'], 'UNSUPPORTED_CONTROL')

    def test_state_checks_do_not_mutate(self):
        self.adapter.find = lambda _: SimpleNamespace(is_visible=lambda: True, is_enabled=lambda: False)
        steps = [{'action': a, 'target': {'name': 'test'}, 'timeout_seconds': .001} for a in ('verify_visible', 'verify_enabled', 'click')]
        result = run_steps(self.adapter, steps)
        self.assertEqual([s['status'] for s in result['steps']], ['passed', 'failed', 'blocked'])
        self.assertEqual(result['steps'][1]['error_code'], 'STATE_MISMATCH')
