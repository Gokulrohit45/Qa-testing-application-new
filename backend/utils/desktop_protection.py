"""Windows-user-bound encryption for saved desktop test steps.

Only the current Windows account can decrypt on the same supported installation.
No password, key file, machine-wide scope, or plaintext fallback is used.
"""
import base64
import json
import sys


def protect_steps(steps):
    if sys.platform != 'win32':
        raise ValueError('Saving protected desktop tests requires Windows')
    try:
        import win32crypt
        payload = json.dumps(steps, ensure_ascii=False).encode('utf-8')
        encrypted = win32crypt.CryptProtectData(payload, 'QA-AI desktop steps', None, None, None, 1)
    except Exception as error:
        raise ValueError('Windows could not protect this test. Nothing was saved; retry from your signed-in Windows account.') from error
    return {'format': 'windows-dpapi-v1', 'data': base64.b64encode(encrypted).decode('ascii')}


def unprotect_steps(envelope):
    if sys.platform != 'win32' or envelope.get('format') != 'windows-dpapi-v1':
        raise ValueError('Desktop test protection is unavailable on this device')
    try:
        import win32crypt
        raw = base64.b64decode(envelope['data'], validate=True)
        _, payload = win32crypt.CryptUnprotectData(raw, None, None, None, 1)
        steps = json.loads(payload.decode('utf-8'))
        if not isinstance(steps, list): raise ValueError('Invalid steps')
        return steps
    except Exception as error:
        raise ValueError('Cannot unlock this desktop test with the current Windows account') from error
