"""Experimental desktop worker. Importing this module never opens an application.

The caller must isolate this worker in a process for a hard timeout: Windows UIA
providers can block inside COM calls. No global keyboard or coordinate fallback.
"""
import time
import traceback
from pathlib import Path
from datetime import datetime, timezone


class DesktopError(RuntimeError):
    pass


class UnsupportedControl(DesktopError):
    pass


def validate_steps(steps):
    if not isinstance(steps, list) or not steps:
        raise ValueError("At least one desktop step is required")
    for step in steps:
        if not isinstance(step, dict) or step.get("action") not in {"click", "fill", "verify_text", "verify_visible", "verify_enabled", "verify_checked", "check", "uncheck", "select", "expand", "collapse"}:
            raise ValueError("Unsupported desktop action")
        target = step.get("target")
        if not isinstance(target, dict) or not target or set(target) - {"name", "automation_id", "control_type"}:
            raise ValueError("Use a structured name, automation_id or control_type target")
        if any(not isinstance(v, str) or not v for v in target.values()):
            raise ValueError("Target fields must be nonempty strings")
        if step["action"] in {"fill", "verify_text"} and not isinstance(step.get("value"), str):
            raise ValueError("fill and verify_text require a string value")
        timeout = step.get("timeout_seconds", 10)
        if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or not 0 < timeout <= 30:
            raise ValueError("Step timeout must be greater than zero and at most 30 seconds")


def run_steps(adapter, steps, stopped=lambda: False, on_step=lambda record: None):
    validate_steps(steps)
    results = []
    failed = False
    for number, step in enumerate(steps, 1):
        start = time.monotonic()
        record = {"step_number": number, "action": step["action"], "status": "blocked"}
        if failed:
            record["error"] = "Not run because an earlier step failed or was cancelled"
        if stopped():
            record["status"] = "cancelled"
        elif not failed:
            try:
                deadline = start + step.get("timeout_seconds", 10)
                while True:
                    if stopped():
                        record["status"] = "cancelled"
                        break
                    control = adapter.find(step["target"])
                    if control is not None:
                        if step["action"].startswith('verify_'):
                            matched = adapter.read(control) == step["value"] if step['action'] == 'verify_text' else adapter.check(control, step['action'])
                            if matched:
                                record["status"] = "passed"
                                break
                        else:
                            # Mutating actions are performed once, never blindly retried.
                            adapter.perform(control, step["action"], step.get("value", ""))
                            record["status"] = "passed"
                            break
                    if time.monotonic() >= deadline:
                        if control is not None and step['action'] == 'verify_text':
                            record.update(error_code='TEXT_MISMATCH', error='Editor text did not match the expected text before the timeout',
                                          recommendation='Check the expected text, including spaces and capitalization, and confirm the correct editor is selected.')
                        elif control is not None and step['action'].startswith('verify_'):
                            record.update(error_code='STATE_MISMATCH', error='The control did not reach the expected state before the timeout',
                                          recommendation='Check the selected control and the preceding action.')
                        else:
                            record.update(error_code='CONTROL_UNAVAILABLE', error='The selected control was not available before the timeout',
                                          recommendation='Inspect the window again and select a visible, uniquely identified control.')
                        raise DesktopError("Control unavailable or expected text not observed before deadline")
                    time.sleep(0.05)
            except Exception as error:
                # Provider exceptions may contain private field values.
                record.update(status="failed", error_type=type(error).__name__)
                record.setdefault('error', 'Desktop action failed; inspect the selected control and application state')
                if isinstance(error, UnsupportedControl):
                    record.update(error_code='UNSUPPORTED_CONTROL', error='This control does not expose the Windows automation pattern required for this action.',
                                  recommendation='Choose a compatible control or action. No coordinate or keyboard fallback was attempted.')
                # Frame locations only: no exception text, source lines or locals
                # which could expose entered passwords or application content.
                record["error_location"] = [
                    {"file": Path(frame.filename).name, "line": frame.lineno, "function": frame.name}
                    for frame in traceback.extract_tb(error.__traceback__)[-4:]
                ]
                failed = True
        record["duration_ms"] = round((time.monotonic() - start) * 1000)
        record["completed_at"] = datetime.now(timezone.utc).isoformat()
        results.append(record)
        on_step(dict(record))
        if record["status"] == "cancelled":
            failed = True
    status = "cancelled" if any(r["status"] == "cancelled" for r in results) else "failed" if failed else "passed"
    return {"status": status, "steps": results}


class WindowsAdapter:
    def __init__(self, handle, process_id):
        import sys
        if sys.platform != "win32":
            raise DesktopError("Windows is required")
        from pywinauto import Desktop
        self.window = Desktop(backend="uia").window(handle=handle).wrapper_object()
        if self.window.process_id() != process_id:
            raise DesktopError("Selected window does not belong to the approved process")
        self.process_id = process_id

    def find(self, target):
        if self.window.process_id() != self.process_id:
            raise DesktopError("Application identity changed")
        matches = []
        for control in self.window.descendants():
            info = control.element_info
            values = {"name": info.name, "automation_id": info.automation_id, "control_type": info.control_type}
            if all(values[k] == v for k, v in target.items()) and control.is_visible():
                matches.append(control)
        if len(matches) > 1:
            raise DesktopError("Ambiguous control: refine the target")
        return matches[0] if matches else None

    def read(self, control):
        from pywinauto.uia_defines import NoPatternInterfaceError
        try:
            return control.iface_value.CurrentValue
        except (AttributeError, NoPatternInterfaceError):
            # Rich text editors can expose TextPattern without ValuePattern.
            # Never use the accessible name as proof of editor content.
            return control.iface_text.DocumentRange.GetText(-1)

    def perform(self, control, action, value):
        if not control.is_enabled():
            raise DesktopError("Control is disabled")
        if action == "fill":
            # Document controls may support ValuePattern but use UIAWrapper,
            # which has no EditWrapper.set_edit_text convenience method.
            pattern = control.iface_value
            if pattern.CurrentIsReadOnly:
                raise DesktopError("Control is read-only")
            pattern.SetValue(value)
        elif action == 'click':
            control.invoke()
        elif action in {'check', 'uncheck'}:
            pattern = self.pattern(control, 'toggle')
            desired = 1 if action == 'check' else 0
            state = pattern.CurrentToggleState
            if state == 2:
                raise UnsupportedControl('Indeterminate toggle is not supported')
            if state != desired:
                pattern.Toggle()
            if pattern.CurrentToggleState != desired:
                raise DesktopError('Toggle did not reach requested state')
        elif action == 'select':
            self.pattern(control, 'selection_item').Select()
        elif action in {'expand', 'collapse'}:
            pattern = self.pattern(control, 'expand_collapse')
            if action == 'expand': pattern.Expand()
            else: pattern.Collapse()

    @staticmethod
    def pattern(control, name):
        from pywinauto.uia_defines import NoPatternInterfaceError
        try:
            return getattr(control, 'iface_' + name)
        except (AttributeError, NoPatternInterfaceError) as error:
            raise UnsupportedControl('Missing automation pattern') from error

    def check(self, control, action):
        if action == 'verify_visible': return control.is_visible()
        if action == 'verify_enabled': return control.is_enabled()
        if action == 'verify_checked': return self.pattern(control, 'toggle').CurrentToggleState == 1
        raise DesktopError('Unsupported assertion')
