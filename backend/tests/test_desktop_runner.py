import sys
import unittest
import importlib.util
from types import SimpleNamespace
from unittest.mock import Mock, patch
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core.desktop_runner import run_steps, validate_steps, WindowsAdapter, DesktopError


class ValuePatternTests(unittest.TestCase):
    def control(self, readonly=False):
        pattern = SimpleNamespace(CurrentIsReadOnly=readonly, SetValue=Mock())
        return SimpleNamespace(is_enabled=lambda: True, iface_value=pattern)

    def test_document_without_editwrapper_method(self):
        control = self.control()
        self.assertFalse(hasattr(control, "set_edit_text"))
        WindowsAdapter.perform(None, control, "fill", "sample")
        control.iface_value.SetValue.assert_called_once_with("sample")

    def test_readonly_is_not_changed(self):
        control = self.control(True)
        with self.assertRaises(DesktopError): WindowsAdapter.perform(None, control, "fill", "sample")
        control.iface_value.SetValue.assert_not_called()

    def test_provider_error_does_not_retry(self):
        control = self.control()
        control.iface_value.SetValue.side_effect = RuntimeError("private")
        with self.assertRaises(RuntimeError): WindowsAdapter.perform(None, control, "fill", "sample")
        self.assertEqual(control.iface_value.SetValue.call_count, 1)


class FakeAdapter:
    value = ""
    calls = 0
    def find(self, target): return self
    def read(self, control): return self.value
    def perform(self, control, action, value):
        self.calls += 1
        self.value = value


class DesktopRunnerTests(unittest.TestCase):
    def step(self, action="fill", value="sample"):
        return dict(action=action, value=value, target={"control_type": "Edit"}, timeout_seconds=0.01)

    def test_fill_and_assert(self):
        result = run_steps(FakeAdapter(), [self.step(), self.step("verify_text")])
        self.assertEqual(result["status"], "passed")
        self.assertTrue(all(s["completed_at"] for s in result["steps"]))

    def test_failed_assert_blocks_following_mutation(self):
        adapter = FakeAdapter()
        result = run_steps(adapter, [self.step("verify_text"), self.step()])
        self.assertEqual([s["status"] for s in result["steps"]], ["failed", "blocked"])
        self.assertEqual(adapter.calls, 0)

    def test_stop_does_not_mutate(self):
        adapter = FakeAdapter()
        self.assertEqual(run_steps(adapter, [self.step()], lambda: True)["status"], "cancelled")
        self.assertEqual(adapter.calls, 0)

    def test_reject_unsupported_before_action(self):
        adapter = FakeAdapter()
        with self.assertRaises(ValueError):
            run_steps(adapter, [self.step(), self.step("shell")])
        self.assertEqual(adapter.calls, 0)

    def test_ambiguous_provider_failure_redacted(self):
        adapter = FakeAdapter()
        def fail(target): raise RuntimeError("private-password")
        adapter.find = fail
        result = run_steps(adapter, [self.step()])
        self.assertEqual(result["status"], "failed")
        self.assertNotIn("private-password", str(result))

    def test_invalid_timeouts(self):
        for value in [True, 0, 31, float("nan"), float("inf")]:
            step = self.step()
            step["timeout_seconds"] = value
            with self.assertRaises(ValueError): validate_steps([step])


class PilotFallbackTests(unittest.TestCase):
    def setUp(self):
        path = Path(__file__).resolve().parents[2] / "scripts" / "notepad-pilot.py"
        spec = importlib.util.spec_from_file_location("notepad_pilot_test", path)
        self.pilot = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.pilot)
        self.control = Mock()
        self.control.has_keyboard_focus.return_value = True
        self.window = SimpleNamespace(handle=123)
        self.value = "QA-AI desktop pilot " + "a" * 32

    def run_fill(self, content="", foreground=123):
        with patch.dict(sys.modules, {"win32gui": SimpleNamespace(GetForegroundWindow=lambda: foreground)}):
            self.pilot.enter_blank_pilot_text(self.control, self.value, self.window, lambda _: content)

    def test_empty_focused_editor_types_once(self):
        self.run_fill()
        self.control.type_keys.assert_called_once()

    def test_existing_text_never_overwritten(self):
        with self.assertRaises(RuntimeError): self.run_fill(content="existing document")
        self.control.type_keys.assert_not_called()

    def test_other_foreground_refused(self):
        with self.assertRaises(RuntimeError): self.run_fill(foreground=456)
        self.control.type_keys.assert_not_called()

    def test_wrong_control_focus_refused(self):
        self.control.has_keyboard_focus.return_value = False
        with self.assertRaises(RuntimeError): self.run_fill()
        self.control.type_keys.assert_not_called()

    def test_keyboard_commands_refused(self):
        self.value = "^a{DELETE}"
        with self.assertRaises(RuntimeError): self.run_fill()
        self.control.type_keys.assert_not_called()
