"""Check a locally built engine without discovering or controlling any windows."""
import argparse
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import urllib.error
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('executable', type=Path)
    parser.add_argument('--browsers', type=Path, help='Exercise headless and visible Chromium using this browser directory')
    args = parser.parse_args()
    executable = args.executable.resolve(strict=True)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    token = secrets.token_urlsafe(32)
    with tempfile.TemporaryDirectory(prefix='qa-frozen-check-') as directory:
        env = dict(os.environ)
        for key in ('SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY', 'BREVO_API_KEY'):
            env.pop(key, None)
        env.update(QA_AI_DESKTOP='1', QA_AI_ENABLE_DESKTOP_RUNNER='1',
                   QA_AI_DATA_DIR=directory, LOCAL_API_TOKEN=token, PORT=str(port), PYTHONUTF8='1')
        if args.browsers:
            env['PLAYWRIGHT_BROWSERS_PATH'] = str(args.browsers.resolve(strict=True))
        with tempfile.TemporaryFile() as log:
            process = subprocess.Popen([str(executable)], cwd=directory, env=env,
                stdout=log, stderr=log, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            try:
                url = f'http://127.0.0.1:{port}/api/health'
                opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
                deadline = time.monotonic() + 60
                while True:
                    if process.poll() is not None:
                        raise RuntimeError('Packaged engine exited before becoming ready')
                    try:
                        request = urllib.request.Request(url, headers={'X-QA-AI-Token': token})
                        with opener.open(request, timeout=2) as response:
                            result = json.load(response)
                        break
                    except (urllib.error.URLError, TimeoutError):
                        if time.monotonic() >= deadline:
                            raise RuntimeError('Packaged engine readiness timed out')
                        time.sleep(0.3)
                assert result['status'] == 'ok'
                assert result['playwright_available'] is True
                assert result['capabilities']['desktop_execution'] is True
                try:
                    opener.open(url, timeout=2)
                    raise AssertionError('Unauthenticated local access was accepted')
                except urllib.error.HTTPError as error:
                    assert error.code == 401
                if args.browsers:
                    check_browser_execution(opener, port, token)
            finally:
                if process.poll() is None:
                    subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True,
                        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                    process.wait(timeout=10)
    print('Frozen engine passed: startup, web module, desktop availability, local access protection and cleanup.')
    print('This is not full native desktop or installer lifecycle acceptance.')


def check_browser_execution(opener, port, token):
    class Target(BaseHTTPRequestHandler):
        def do_GET(self):
            body = b'<html><body><button>Packaged browser ready</button></body></html>'
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        def log_message(self, *_args):
            pass
    target = ThreadingHTTPServer(('127.0.0.1', 0), Target)
    worker = threading.Thread(target=target.serve_forever, daemon=True)
    worker.start()
    def request(endpoint, payload=None):
        body = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(f'http://127.0.0.1:{port}/api/{endpoint}', data=body,
            headers={'X-QA-AI-Token': token, 'Content-Type': 'application/json'})
        with opener.open(req, timeout=10) as response:
            return json.load(response)
    try:
        for headless in (True, False):
            run = request('execute', {'project_id': 'packaged-browser-regression',
                'user_id': 'local-fixture', 'app_url': f'http://127.0.0.1:{target.server_port}/',
                'headless': headless, 'timeout_seconds': 10,
                'steps': [{'action': 'verify', 'target': 'Packaged browser ready', 'value': ''}]})
            deadline = time.monotonic() + 60
            while True:
                result = request(f"executions/{run['execution_id']}/logs")
                if result['status'] in ('Passed', 'Failed', 'Stopped'):
                    break
                assert time.monotonic() < deadline, 'Packaged browser execution timed out'
                time.sleep(.25)
            assert result['status'] == 'Passed', result.get('error_message', result)
            assert len(result['logs']) == 2, result
            assert result['total_steps'] == 2, result
            print(f"Packaged Chromium {'headless' if headless else 'visible'} execution passed.")
    finally:
        target.shutdown()
        target.server_close()
        worker.join(timeout=5)


if __name__ == '__main__':
    main()
