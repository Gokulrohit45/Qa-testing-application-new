from flask import Blueprint, request, jsonify
import uuid
from core import desktop_jobs
from core.desktop_runner import validate_steps
from core import desktop_storage
from utils import local_store

desktop_bp = Blueprint('desktop', __name__)


@desktop_bp.before_request
def require_local_desktop():
    if not desktop_jobs.available():
        return jsonify(error='Desktop preview is disabled or its Windows dependencies are missing'), 503


@desktop_bp.route('/api/desktop/jobs', methods=['POST'])
def create_job():
    data = request.get_json(silent=True)
    if not isinstance(data, dict): return jsonify(error='An object is required'), 400
    kind = data.get('kind')
    if kind not in {'windows', 'controls', 'run'}: return jsonify(error='Unsupported desktop operation'), 400
    if kind != 'windows':
        for key in ('handle', 'process_id'):
            if type(data.get(key)) is not int or data[key] <= 0:
                return jsonify(error=f'{key} must be a positive integer'), 400
        if not isinstance(data.get('title'), str) or not data['title']:
            return jsonify(error='Select a window first'), 400
    try:
        if kind == 'run':
            if data.get('project_id'):
                desktop_storage.project(data['project_id'])
            data.pop('test_name', None)
            data.pop('suite_tests', None)
            if data.get('suite_id'):
                saved = local_store.get('desktop_suite', data.pop('suite_id'))
                if not saved or saved.get('project_id') != data.get('project_id'):
                    raise ValueError('Suite does not belong to this project')
                data['suite_ids'] = saved['test_ids']
                data['continue_on_failure'] = saved['continue_on_failure']
                data['test_name'] = saved.get('name', 'Saved desktop suite')
            if 'suite_ids' in data:
                ids = data['suite_ids']
                if not isinstance(ids, list) or not 1 <= len(ids) <= 20 or any(not isinstance(i, str) for i in ids) or len(set(ids)) != len(ids):
                    raise ValueError('Select 1 to 20 distinct saved tests')
                if type(data.get('continue_on_failure', False)) is not bool:
                    raise ValueError('Failure policy must be boolean')
                suite = []
                for identifier in ids:
                    test = local_store.get('desktop_test', identifier)
                    if not test or test.get('project_id') != data.get('project_id'):
                        raise ValueError('Suite test does not belong to this project')
                    suite.append(dict(test, name=test.get('name', 'Saved desktop test')))
                data['suite_tests'] = suite
                data['steps'] = [step for test in suite for step in test['steps']]
                data.pop('test_id', None)
                data['test_name'] = data.get('test_name', 'Desktop suite')
            if data.get('test_id'):
                test = local_store.get('desktop_test', data['test_id'])
                if not test or test.get('project_id') != data.get('project_id'):
                    raise ValueError('Test does not belong to this project')
                if test['steps'] != data.get('steps'):
                    raise ValueError('Save the edited test before running')
                data['test_name'] = test.get('name', 'Saved desktop test')
            if data.get('confirmed') is not True: return jsonify(error='Confirm desktop interaction before running'), 400
            if data.get('project_id'):
                from core.credential_vault import values,resolve_desktop
                owner=desktop_storage.project(data['project_id'])
                runtime=values(data['project_id'],owner.get('user_id'))
                supplied=data.get('variables',{})
                if not isinstance(supplied,dict): raise ValueError('Runtime variables must be an object')
                runtime.update(supplied)
                data['steps']=resolve_desktop(data['steps'],runtime)
                if data.get('suite_tests'):
                    data['suite_tests']=[dict(test,steps=resolve_desktop(test['steps'],runtime)) for test in data['suite_tests']]

            validate_steps(data.get('steps'))
            if len(data['steps']) > 100: return jsonify(error='Preview supports at most 100 steps'), 400
        job_id = desktop_jobs.start(kind, data)
    except ValueError as error:
        return jsonify(error=str(error)), 400
    return jsonify(id=job_id), 202


@desktop_bp.route('/api/desktop/jobs/<job_id>', methods=['GET'])
def get_job(job_id):
    job = desktop_jobs.snapshot(job_id)
    return (jsonify(job), 200) if job else (jsonify(error='Job not found'), 404)


@desktop_bp.route('/api/desktop/jobs/<job_id>/stop', methods=['POST'])
def stop_job(job_id):
    return (jsonify(stopping=True), 202) if desktop_jobs.stop(job_id) else (jsonify(error='Job not found'), 404)


@desktop_bp.route('/api/desktop/projects/<project_id>/test', methods=['GET', 'PUT'])
def saved_test(project_id):
    try:
        desktop_storage.project(project_id)
        if request.method == 'GET':
            return jsonify(local_store.get('desktop_test', project_id) or {'steps': []})
        data = request.get_json(silent=True)
        if not isinstance(data, dict): raise ValueError('An object is required')
        return jsonify(desktop_storage.save_test(project_id, data))
    except ValueError as error:
        return jsonify(error=str(error)), 400


@desktop_bp.route('/api/desktop/projects/<project_id>/tests', methods=['GET', 'POST'])
@desktop_bp.route('/api/desktop/projects/<project_id>/tests/<test_id>', methods=['PUT', 'DELETE'])
def named_tests(project_id, test_id=None):
    try:
        desktop_storage.project(project_id)
        if request.method == 'GET':
            records = local_store.list_records('desktop_test', project_id=project_id)
            return jsonify([dict(r, name=r.get('name', 'Saved desktop test')) for r in records])
        if test_id:
            existing = local_store.get('desktop_test', test_id)
            if not existing or existing.get('project_id') != project_id:
                return jsonify(error='Test not found in this project'), 404
        if request.method == 'DELETE':
            local_store.delete('desktop_test', test_id)
            return jsonify(success=True)
        data = request.get_json(silent=True)
        if not isinstance(data, dict): raise ValueError('An object is required')
        return jsonify(desktop_storage.save_test(project_id, data, test_id or str(uuid.uuid4())))
    except ValueError as error:
        return jsonify(error=str(error)), 400


@desktop_bp.route('/api/desktop/projects/<project_id>/history', methods=['GET'])
def history(project_id):
    try:
        desktop_storage.project(project_id)
        records = local_store.list_records('desktop_run', project_id=project_id)
        for record in records:
            if record['status'] in {'running', 'stopping'} and not desktop_jobs.snapshot(record['id']):
                record.update(status='interrupted', error='Application closed before completion was confirmed. Inspect the target before rerunning.')
                local_store.upsert('desktop_run', record)
        return jsonify(records)
    except ValueError as error:
        return jsonify(error=str(error)), 400


@desktop_bp.route('/api/desktop/projects/<project_id>/suite', methods=['GET', 'PUT'])
def saved_suite(project_id):
    try:
        desktop_storage.project(project_id)
        if request.method == 'GET':
            return jsonify(local_store.get('desktop_suite', project_id) or {'test_ids': [], 'continue_on_failure': False})
        data = request.get_json(silent=True)
        if not isinstance(data, dict): raise ValueError('An object is required')
        return jsonify(desktop_storage.save_suite(project_id, data))
    except ValueError as error:
        return jsonify(error=str(error)), 400


@desktop_bp.route('/api/desktop/projects/<project_id>/suites', methods=['GET', 'POST'])
@desktop_bp.route('/api/desktop/projects/<project_id>/suites/<suite_id>', methods=['PUT', 'DELETE'])
def named_suites(project_id, suite_id=None):
    try:
        desktop_storage.project(project_id)
        if request.method == 'GET':
            return jsonify(local_store.list_records('desktop_suite', project_id=project_id))
        if suite_id:
            existing = local_store.get('desktop_suite', suite_id)
            if not existing or existing.get('project_id') != project_id:
                return jsonify(error='Suite not found in this project'), 404
        if request.method == 'DELETE':
            local_store.delete('desktop_suite', suite_id)
            return jsonify(success=True)
        data = request.get_json(silent=True)
        if not isinstance(data, dict): raise ValueError('An object is required')
        return jsonify(desktop_storage.save_suite(project_id, data, suite_id or str(uuid.uuid4())))
    except ValueError as error:
        return jsonify(error=str(error)), 400

@desktop_bp.route('/api/desktop/projects/<project_id>/snapshot', methods=['GET','PUT'])
def workspace_snapshot(project_id):
    import hashlib
    import json
    from core.desktop_snapshot import export_workspace, import_workspace
    def fingerprint(value):
        return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    try:
        user_id=request.args.get('user_id')
        with desktop_jobs.LOCK, local_store._LOCK:
            if any(j['status'] in ('running','stopping') or j.get('worker_active') for j in desktop_jobs.JOBS.values()):
                return jsonify(error='Finish the active desktop operation before synchronizing'),409
            current=local_store.get('project',project_id)
            payload=export_workspace(project_id,user_id) if current else None
            current_hash=fingerprint(payload) if payload else None
            if request.method=='GET':
                return jsonify(payload=payload,fingerprint=current_hash,state=local_store.get('desktop_cloud_state',project_id) or {'revision':0})
            data=request.get_json(silent=True)
            if not isinstance(data,dict) or 'expected_fingerprint' not in data: raise ValueError('Snapshot precondition is required')
            if data['expected_fingerprint']!=current_hash:
                return jsonify(error='Local workspace changed during synchronization'),409
            saved=import_workspace(project_id,user_id,data.get('payload'))
            return jsonify(project=saved)
    except (ValueError,TypeError,KeyError) as error:
        return jsonify(error=str(error)),400


@desktop_bp.route('/api/desktop/projects/<project_id>/sync-state', methods=['PUT'])
def save_sync_state(project_id):
    from core.desktop_snapshot import export_workspace
    try:
        user_id=request.args.get('user_id')
        export_workspace(project_id,user_id)
        data=request.get_json(silent=True)
        if not isinstance(data,dict) or type(data.get('revision')) is not int or data['revision']<1 or not isinstance(data.get('fingerprint'),str):
            raise ValueError('Invalid synchronization state')
        old=local_store.get('desktop_cloud_state',project_id)
        if old and old.get('revision',0)>data['revision']:
            return jsonify(error='A newer cloud revision is already recorded'),409
        owner=desktop_storage.project(project_id)
        local_store.upsert('project',dict(owner,cloud_connected=True,sync_state='synced'))
        return jsonify(local_store.upsert('desktop_cloud_state',dict(id=project_id,project_id=project_id,user_id=user_id,
            revision=data['revision'],fingerprint=data['fingerprint'])))
    except ValueError as error:
        return jsonify(error=str(error)),400
