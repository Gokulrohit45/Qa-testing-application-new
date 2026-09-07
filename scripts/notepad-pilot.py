"""User-run interactive pilot. Never imported by the application server.

Run with the optional desktop dependencies installed. Refuses existing Notepad
processes; leaves the pilot window open for inspection, even on failure.
"""
import argparse
import csv
import io
import json
import multiprocessing
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))


def enter_blank_pilot_text(control, value, window, read):
    """Opt-in pilot fallback only; never replaces existing editor content."""
    import re
    import win32gui
    if not re.fullmatch(r"QA-AI desktop pilot [0-9a-f]{32}", value):
        raise RuntimeError("Keyboard fallback only accepts generated pilot text")
    if read(control) != "":
        raise RuntimeError("Pilot editor is not empty; no keyboard input sent")
    control.set_focus()
    if win32gui.GetForegroundWindow() != window.handle or not control.has_keyboard_focus():
        raise RuntimeError("Pilot editor does not own focus; no keyboard input sent")
    control.type_keys(value, with_spaces=True, pause=0.01, set_foreground=False)


def worker(folder):
    from pywinauto import Desktop
    from pywinauto.application import process_module
    from core.desktop_runner import WindowsAdapter, run_steps
    from pywinauto.uia_defines import NoPatternInterfaceError
    class NotepadPilotAdapter(WindowsAdapter):
        def perform(self, control, action, value):
            if action == "fill":
                if not control.is_enabled():
                    raise RuntimeError("Editor is disabled")
                try:
                    control.iface_value
                except NoPatternInterfaceError:
                    # Determine support BEFORE any mutation; no retry after a
                    # possibly partially successful SetValue operation.
                    enter_blank_pilot_text(control, value, self.window, self.read)
                    return
            return super().perform(control, action, value)
    folder = Path(folder)
    report = {"status": "failed", "message": "Pilot did not complete"}
    try:
        processes = subprocess.run(["tasklist", "/FI", "IMAGENAME eq notepad.exe", "/FO", "CSV", "/NH"],
                                   capture_output=True, text=True, check=True, timeout=10)
        rows = csv.reader(io.StringIO(processes.stdout))
        if any(row and row[0].casefold() == "notepad.exe" for row in rows):
            raise RuntimeError("Close Notepad after saving your documents, then retry")
        path = folder / ("qa-notepad-" + uuid.uuid4().hex + ".txt")
        # Exclusive creation prevents overwriting any existing file.
        with path.open("x", encoding="utf-8") as stream:
            stream.write("")
        executable = Path(os.environ["WINDIR"]) / "System32" / "notepad.exe"
        subprocess.Popen([str(executable), str(path)])
        desktop = Desktop(backend="uia")
        deadline = time.monotonic() + 20
        window = None
        while time.monotonic() < deadline:
            matches = [w for w in desktop.windows() if path.stem in w.window_text()]
            if len(matches) > 1:
                raise RuntimeError("More than one matching window; no input sent")
            if matches:
                window = matches[0]
                break
            time.sleep(0.2)
        if window is None:
            raise RuntimeError("Pilot window not found; no input sent")
        if Path(process_module(window.process_id())).name.casefold() != "notepad.exe":
            raise RuntimeError("Matching window is not Notepad; no input sent")
        adapter = NotepadPilotAdapter(window.handle, window.process_id())
        # Refuse unfamiliar/ambiguous editor layouts instead of guessing.
        candidates = []
        for kind in ("Edit", "Document"):
            candidates.extend(c for c in window.descendants(control_type=kind) if c.is_visible())
        if len(candidates) != 1:
            raise RuntimeError("Notepad editor layout needs inspection; no input sent")
        info = candidates[0].element_info
        target = {"control_type": info.control_type}
        if info.automation_id:
            target["automation_id"] = info.automation_id
        sample = "QA-AI desktop pilot " + uuid.uuid4().hex
        report = run_steps(adapter, [
            {"action": "fill", "target": target, "value": sample},
            {"action": "verify_text", "target": target, "value": sample}
        ])
        if report["status"] != "passed":
            raise RuntimeError("Editor interaction failed; save was not attempted")
        window.set_focus()
        import win32gui
        if win32gui.GetForegroundWindow() != window.handle:
            raise RuntimeError("Pilot window is not focused; save was not attempted")
        window.type_keys("^s")
        deadline = time.monotonic() + 5
        saved = False
        while time.monotonic() < deadline:
            raw = path.read_bytes()
            for encoding in ("utf-8-sig", "utf-16"):
                try:
                    saved = raw.decode(encoding) == sample
                except UnicodeError:
                    continue
                if saved:
                    break
            if saved:
                break
            time.sleep(0.1)
        report["file_verified"] = saved
        report["status"] = "passed" if saved else "failed"
        report["test_file"] = str(path)
    except Exception as error:
        report.update(status="failed", message=str(error))
    finally:
        (folder / "result.json").write_text(json.dumps(report, indent=2), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--confirm-interactive", action="store_true")
    args = parser.parse_args()
    if sys.platform != "win32" or not args.confirm_interactive:
        parser.error("Windows and --confirm-interactive are required; save and close Notepad first")
    folder = ROOT / ".test-results" / ("notepad-" + uuid.uuid4().hex)
    folder.mkdir(parents=True)
    process = multiprocessing.Process(target=worker, args=(str(folder),))
    process.start()
    try:
        process.join(60)
    except KeyboardInterrupt:
        process.terminate()
        process.join(5)
        print("Pilot stopped. Notepad was left open for inspection.")
        return 130
    if process.is_alive():
        process.terminate()
        process.join(5)
        (folder / "result.json").write_text(json.dumps({"status": "timeout", "message": "Worker stopped after 60 seconds; Notepad left open"}))
    result = folder / "result.json"
    print("Pilot result:", result)
    if not result.exists():
        print("Worker could not initialize. Check that desktop dependencies are installed.")
        return 1
    payload = json.loads(result.read_text(encoding="utf-8"))
    print("Status:", payload["status"])
    if payload.get("message"):
        print(payload["message"])
    for step in payload.get("steps", []):
        print("Step", step["step_number"], step["status"], step.get("error_type", ""))
        for location in step.get("error_location", []):
            print("  at", location["file"], "line", location["line"], location["function"])
    return 0 if payload["status"] == "passed" else 1


if __name__ == "__main__":
    multiprocessing.freeze_support()
    raise SystemExit(main())
