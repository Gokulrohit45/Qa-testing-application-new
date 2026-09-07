"""Local-only desktop definitions and value-free execution evidence."""
from datetime import datetime, timezone
from utils import local_store
from core.desktop_runner import validate_steps


def project(project_id):
    record = local_store.get('project', project_id)
    if not record or record.get('project_type') != 'desktop':
        raise ValueError('A local desktop project is required')
    return record


def save_test(project_id, data, test_id=None):
    owner = project(project_id)
    steps = data.get('steps')
    validate_steps(steps)
    if len(steps) > 100:
        raise ValueError('At most 100 steps are supported')
    record_id = test_id or project_id
    existing = local_store.get('desktop_test', record_id)
    if existing and existing.get('project_id') != project_id:
        raise ValueError('Test does not belong to this project')
    name = data.get('name', (existing or {}).get('name', 'Saved desktop test'))
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 120:
        raise ValueError('Test name must contain 1 to 120 characters')
    # Deliberately exclude window handles, process IDs and authorization.
    clean = [{k: s[k] for k in ('action', 'target', 'value', 'timeout_seconds') if k in s} for s in steps]
    return local_store.upsert('desktop_test', {
        'id': record_id, 'name': name.strip(), 'project_id': project_id, 'user_id': owner.get('user_id'),
        'steps': clean, 'updated_at': datetime.now(timezone.utc).isoformat()})


def save_run(job, project_id):
    owner = project(project_id)
    record = {k: job[k] for k in ('id', 'status', 'steps', 'duration_ms', 'created_at', 'error', 'test_id', 'test_name', 'tests') if k in job}
    record.update(project_id=project_id, user_id=owner.get('user_id'))
    local_store.upsert('desktop_run', record)


def save_suite(project_id, data, suite_id=None):
    owner = project(project_id)
    identifiers = data.get('test_ids')
    if not isinstance(identifiers, list) or not 1 <= len(identifiers) <= 20 or any(not isinstance(i, str) or not i for i in identifiers) or len(set(identifiers)) != len(identifiers):
        raise ValueError('Select 1 to 20 distinct saved tests')
    total = 0
    for identifier in identifiers:
        test = local_store.get('desktop_test', identifier)
        if not test or test.get('project_id') != project_id:
            raise ValueError('Suite test does not belong to this project')
        total += len(test['steps'])
    if total > 100:
        raise ValueError('Suite supports at most 100 steps')
    policy = data.get('continue_on_failure', False)
    if type(policy) is not bool:
        raise ValueError('Failure policy must be boolean')
    identifier = suite_id or project_id
    existing = local_store.get('desktop_suite', identifier)
    if existing and existing.get('project_id') != project_id:
        raise ValueError('Suite does not belong to this project')
    name = data.get('name', (existing or {}).get('name', 'Saved desktop suite'))
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 120:
        raise ValueError('Suite name must contain 1 to 120 characters')
    return local_store.upsert('desktop_suite', {
        'id': identifier, 'name': name.strip(), 'project_id': project_id,
        'user_id': owner.get('user_id'), 'test_ids': identifiers,
        'continue_on_failure': policy, 'updated_at': datetime.now(timezone.utc).isoformat()})
