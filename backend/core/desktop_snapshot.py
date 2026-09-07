"""Portable desktop snapshots. Machine bindings, authorization and the local vault never leave the device."""
import json
import uuid
from datetime import datetime, timezone
from core.desktop_runner import validate_steps
from core.desktop_storage import project
from utils import local_store
from utils.desktop_protection import protect_steps


def fields(value, keys):
    return {key: value[key] for key in keys if key in value}


def export_workspace(project_id, user_id):
    owner = project(project_id)
    if not user_id or owner.get('user_id') != user_id:
        raise ValueError('Workspace does not belong to the signed-in account')
    def records(kind):
        return sorted(local_store.list_records(kind, project_id=project_id), key=lambda row: row['id'])
    payload = {'schema_version': 1,
        'project': dict(fields(owner, ('id','name','app_name','description','created_at')), project_type='desktop'),
        'tests': [fields(row, ('id','name','steps')) for row in records('desktop_test')],
        'suites': [fields(row, ('id','name','test_ids','continue_on_failure')) for row in records('desktop_suite')],
        'runs': [fields(row, ('id','status','steps','duration_ms','created_at','error','test_id','test_name','tests')) for row in records('desktop_run')]}
    return validate_snapshot(payload, project_id)


def validate_snapshot(value, project_id):
    if not isinstance(value, dict) or value.get('schema_version') != 1 or set(value)-{'schema_version','project','tests','suites','runs'}:
        raise ValueError('Unsupported cloud workspace format')
    if len(json.dumps(value).encode('utf-8')) > 2*1024*1024:
        raise ValueError('Workspace exceeds the 2 MB synchronization limit')
    meta=value.get('project')
    if not isinstance(meta,dict) or meta.get('id') != project_id or meta.get('project_type') != 'desktop':
        raise ValueError('Cloud project identity does not match')
    if not isinstance(meta.get('name'),str) or not meta['name'].strip() or len(meta['name'])>120:
        raise ValueError('A workspace name is required')
    result={'schema_version':1,'project':fields(meta,('id','name','app_name','description','created_at','project_type'))}
    identifiers=set()
    for kind,limit in [('tests',200),('suites',100),('runs',1000)]:
        rows=value.get(kind,[])
        if not isinstance(rows,list) or len(rows)>limit: raise ValueError('Invalid workspace collection')
        result[kind]=[]
        for row in rows:
            if not isinstance(row,dict) or not isinstance(row.get('id'),str) or not row['id'] or len(row['id'])>120:
                raise ValueError('Invalid record identity')
            key=(kind,row['id'])
            if key in identifiers: raise ValueError('Duplicate record identity')
            identifiers.add(key)
            if kind=='tests':
                validate_steps(row.get('steps'))
                if len(row['steps'])>100: raise ValueError('At most 100 steps per test')
                if not isinstance(row.get('name','Saved desktop test'),str): raise ValueError('Invalid test name')
                clean=fields(row,('id','name'))
                clean['steps']=[fields(step,('action','target','value','timeout_seconds')) for step in row['steps']]
            elif kind=='suites':
                ids=row.get('test_ids')
                if not isinstance(ids,list) or not 1<=len(ids)<=20 or any(not isinstance(i,str) for i in ids) or len(set(ids))!=len(ids): raise ValueError('Invalid suite membership')
                if any(('tests',i) not in identifiers for i in ids): raise ValueError('Suite references a missing test')
                if sum(len(t['steps']) for t in result['tests'] if t['id'] in ids)>100: raise ValueError('Suite exceeds 100 steps')
                if type(row.get('continue_on_failure',False)) is not bool: raise ValueError('Invalid suite policy')
                clean=fields(row,('id','name','test_ids','continue_on_failure'))
            else:
                clean=fields(row,('id','status','duration_ms','created_at','error','test_id','test_name'))
                if clean.get('status') not in ('passed','failed','cancelled','interrupted','timeout','running','stopping'): raise ValueError('Invalid run status')
                if not isinstance(row.get('steps',[]),list) or len(row.get('steps',[]))>100: raise ValueError('Invalid run steps')
                clean['steps']=[fields(step,('step_number','action','status','duration_ms','completed_at','test_name','error','error_code','recommendation')) for step in row.get('steps',[]) if isinstance(step,dict)]
                clean['tests']=[fields(t,('test_id','test_name','status')) for t in row.get('tests',[]) if isinstance(t,dict)]
                if clean['status'] in ('running','stopping'):clean['status']='interrupted'
            result[kind].append(clean)
    return result


def import_workspace(project_id,user_id,payload):
    if not user_id: raise ValueError('Sign in required')
    current=local_store.get('project',project_id)
    if current and (current.get('user_id')!=user_id or current.get('project_type')!='desktop'): raise ValueError('Cannot replace another workspace')
    clean=validate_snapshot(payload,project_id)
    backup=protect_steps([export_workspace(project_id,user_id)]) if current else None
    prepared=[]
    for key,kind in [('tests','desktop_test'),('suites','desktop_suite'),('runs','desktop_run')]:
        for row in clean[key]:
            old=local_store.get(kind,row['id'])
            if old and old.get('project_id')!=project_id: raise ValueError('Record belongs to another workspace')
            stored=dict(row,project_id=project_id,user_id=user_id)
            if kind=='desktop_test': stored['protected_steps']=protect_steps(stored.pop('steps'))
            prepared.append((kind,stored))
    meta=dict(clean['project'],user_id=user_id,sync_state='synced')
    stamp=datetime.now(timezone.utc).isoformat()
    with local_store._LOCK,local_store._connect() as connection:
        if backup:
            item={'id':str(uuid.uuid4()),'project_id':project_id,'user_id':user_id,'protected_snapshot':backup}
            connection.execute('INSERT INTO records(kind,id,user_id,project_id,payload,updated_at) VALUES(?,?,?,?,?,?)',('desktop_backup',item['id'],user_id,project_id,json.dumps(item),stamp))
        connection.execute("DELETE FROM records WHERE project_id=? AND kind IN ('desktop_test','desktop_suite','desktop_run')",(project_id,))
        for kind,row in [('project',meta),*prepared]:
            connection.execute('INSERT INTO records(kind,id,user_id,project_id,payload,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at',
                (kind,row['id'],user_id,project_id,json.dumps(row),stamp))
    return meta
