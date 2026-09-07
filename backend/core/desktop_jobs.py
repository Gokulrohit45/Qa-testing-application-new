"""Process-isolated, opt-in local UIA jobs. Never enabled on the cloud server."""
import importlib.util
import multiprocessing as mp
import os
import queue
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from core import desktop_storage
from core.desktop_runner import WindowsAdapter, run_steps

JOBS = {}
LOCK = threading.RLock()


def complete_unreported_steps(job, plan):
    """Keep completed evidence; never mark interrupted work as passed."""
    if job['status'] not in {'cancelled', 'timeout', 'failed'}:
        return
    from datetime import datetime, timezone
    completed = {s['step_number'] for s in job['steps']}
    for number, step in enumerate(plan, 1):
        if number not in completed:
            job['steps'].append({'step_number': number, 'action': step['action'],
                                 'status': 'not_completed', 'duration_ms': None,
                                 'completed_at': datetime.now(timezone.utc).isoformat(),
                                 'error': 'No completion was confirmed before the operation stopped. Check application state before retrying.'})


def available():
    return (sys.platform == 'win32' and os.environ.get('QA_AI_DESKTOP') == '1'
            and os.environ.get('QA_AI_ENABLE_DESKTOP_RUNNER') == '1'
            and bool(os.environ.get('LOCAL_API_TOKEN'))
            and importlib.util.find_spec('pywinauto') is not None)


def worker(kind, payload, output):
    try:
        from pywinauto import Desktop
        if kind == 'windows':
            windows = []
            for w in Desktop(backend='uia').windows():
                if w.is_visible() and w.window_text():
                    windows.append(dict(handle=w.handle, process_id=w.process_id(), title=w.window_text()))
            output.put(('done', {'windows': windows[:100]}))
            return
        adapter = WindowsAdapter(payload['handle'], payload['process_id'])
        if adapter.window.window_text() != payload['title']:
            raise ValueError('Selected window changed; select it again')
        if kind == 'controls':
            controls = []
            for c in adapter.window.descendants():
                if not c.is_visible():
                    continue
                i = c.element_info
                # Password field contents/names are not used as labels.
                if getattr(i, 'is_password', False):
                    continue
                target = {'control_type': i.control_type}
                if i.automation_id:
                    target['automation_id'] = i.automation_id
                elif i.name:
                    target['name'] = i.name
                controls.append({'target': target, 'label': i.automation_id or i.name or i.control_type})
            output.put(('done', {'controls': controls[:200]}))
        else:
            if payload.get('suite_tests'):
                from core.desktop_suite import run_suite
                result = run_suite(adapter, payload['suite_tests'], payload.get('continue_on_failure', False), on_step=lambda r: output.put(('step', r)))
            else:
                result = run_steps(adapter, payload['steps'], on_step=lambda r: output.put(('step', r)))
            output.put(('done', result))
    except Exception as error:
        output.put(('error', {'error_type': type(error).__name__, 'error': 'Desktop operation failed. Refresh the window selection and check control compatibility.'}))


def start(kind, payload):
    with LOCK:
        if any(j['status'] in {'running', 'stopping'} or j.get('worker_active') for j in JOBS.values()):
            raise ValueError('Another desktop operation is active')
        # Bound memory; completed jobs are temporary local results.
        for key in list(JOBS)[:-20]:
            if JOBS[key]['status'] != 'running':
                del JOBS[key]
        job_id = str(uuid.uuid4())
        ctx = mp.get_context('spawn')
        output = ctx.Queue()
        process = ctx.Process(target=worker, args=(kind, payload, output), daemon=True)
        job = {'id': job_id, 'kind': kind, 'status': 'running', 'worker_active': True, 'steps': [], 'started': time.monotonic(), 'stop': threading.Event()}
        JOBS[job_id] = job
        job['created_at'] = datetime.now(timezone.utc).isoformat()
        if kind == 'run':
            job['test_id'] = payload.get('test_id')
            job['test_name'] = payload.get('test_name', 'Unsaved desktop test')
        try:
            if kind == 'run' and payload.get('project_id'):
                desktop_storage.save_run(job, payload['project_id'])
            process.start()
        except Exception:
            del JOBS[job_id]
            output.close()
            raise
    def monitor():
        budget = min(300, sum(s.get('timeout_seconds', 10) for s in payload.get('steps', [])) + 15) if kind == 'run' else 20
        try:
            while True:
                if job['stop'].is_set():
                    with LOCK: job['status'] = 'cancelled'
                    break
                if time.monotonic() - job['started'] >= budget:
                    with LOCK: job['status'] = 'timeout'
                    break
                try:
                    event, data = output.get(timeout=0.1)
                except queue.Empty:
                    if not process.is_alive():
                        with LOCK: job.update(status='failed', error='Desktop worker exited before returning a result')
                        break
                    continue
                with LOCK:
                    if event == 'step': job['steps'].append(data)
                    elif event == 'done':
                        job.update(data)
                        job['status'] = data.get('status', 'passed')
                        break
                    else:
                        job.update(data, status='failed')
                        break
                    if kind == 'run' and payload.get('project_id'):
                        desktop_storage.save_run(job, payload['project_id'])
        except Exception:
            with LOCK:
                job.update(status='failed', error='Desktop monitoring or local history storage failed. Check available disk space before retrying.')
        finally:
            if process.is_alive(): process.terminate()
            process.join(2)
            output.close()
            with LOCK:
                job['worker_active'] = process.is_alive()
                job['duration_ms'] = round((time.monotonic() - job['started']) * 1000)
                if kind == 'run': complete_unreported_steps(job, payload['steps'])
                if kind == 'run' and payload.get('project_id'):
                    try:
                        desktop_storage.save_run(job, payload['project_id'])
                    except Exception:
                        job['error'] = 'Run finished, but local history could not be saved.'
    threading.Thread(target=monitor, daemon=True).start()
    return job_id


def snapshot(job_id):
    with LOCK:
        job = JOBS.get(job_id)
        if not job: return None
        result = {k: list(v) if k == 'steps' else v for k, v in job.items() if k not in {'stop', 'started', 'worker_active'}}
        if job.get('worker_active') and result['status'] not in {'running', 'stopping'}:
            result['status'] = 'stopping'
        return result


def stop(job_id):
    with LOCK:
        job = JOBS.get(job_id)
        if not job: return False
        if job['status'] == 'running':
            job['stop'].set()
            job['status'] = 'stopping'
        return True
