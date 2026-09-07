"""Sequential suites sharing one explicitly approved application window."""
from core.desktop_runner import run_steps, validate_steps


def run_suite(adapter, tests, continue_on_failure=False, stopped=lambda: False, on_step=lambda r: None):
    if not isinstance(tests, list) or not tests or len(tests) > 20:
        raise ValueError('Select between 1 and 20 tests')
    for test in tests: validate_steps(test['steps'])
    outcomes, all_steps = [], []
    blocked = False
    for test in tests:
        offset = len(all_steps)
        def report(record):
            on_step(dict(record, step_number=offset + record['step_number'], test_id=test['id'], test_name=test['name']))
        if blocked or stopped():
            result = {'status': 'blocked', 'steps': []}
        else:
            result = run_steps(adapter, test['steps'], stopped=stopped, on_step=report)
        all_steps.extend(dict(s, step_number=offset+s['step_number'], test_id=test['id'], test_name=test['name']) for s in result['steps'])
        outcomes.append({'test_id': test['id'], 'test_name': test['name'], 'status': result['status']})
        if result['status'] != 'passed' and not continue_on_failure: blocked = True
    status = 'cancelled' if stopped() else 'passed' if all(t['status'] == 'passed' for t in outcomes) else 'failed'
    return {'status': status, 'steps': all_steps, 'tests': outcomes}
