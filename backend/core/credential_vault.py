"""Write-only local credential vault protected by the current Windows account."""
import re
from utils import local_store
from utils.desktop_protection import protect_steps,unprotect_steps

NAME=re.compile(r'^[A-Za-z_][A-Za-z0-9_]{0,63}$')
def owner(project_id,user_id):
    value=local_store.get('project',project_id)
    if not value or not user_id or value.get('user_id')!=user_id: raise ValueError('Project does not belong to this account')
    return value

def save(project_id,user_id,name,value):
    owner(project_id,user_id)
    if not isinstance(name,str) or not NAME.fullmatch(name):raise ValueError('Use a variable name with letters, numbers and underscores')
    if not isinstance(value,str) or not value or len(value)>16384:raise ValueError('Enter a value between 1 and 16384 characters')
    record={'id':f'{project_id}:{name}','project_id':project_id,'user_id':user_id,'name':name,'protected_value':protect_steps([{'value':value}])}
    local_store.upsert('credential',record)
    return {'name':name,'configured':True}

def names(project_id,user_id):
    owner(project_id,user_id)
    return [{'name':r['name'],'configured':True} for r in local_store.list_records('credential',user_id=user_id,project_id=project_id)]

def values(project_id,user_id):
    owner(project_id,user_id)
    return {r['name']:unprotect_steps(r['protected_value'])[0]['value'] for r in local_store.list_records('credential',user_id=user_id,project_id=project_id)}

def resolve_desktop(steps,variables):
    result=[]
    for step in steps:
        item=dict(step)
        def replace(match):
            name=match[1]
            if name not in variables or not isinstance(variables[name],(str,int,float)):raise ValueError(f"Configure runtime variable '{name}' before running")
            return str(variables[name])
        if isinstance(item.get('value'),str):item['value']=re.sub(r'\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}',replace,item['value'])
        result.append(item)
    return result
