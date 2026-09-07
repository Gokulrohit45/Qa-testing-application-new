import os
from flask import Blueprint,request,jsonify
from core import credential_vault as vault
from utils import local_store
vault_bp=Blueprint('vault',__name__)

@vault_bp.before_request
def require_device():
    if os.environ.get('QA_AI_DESKTOP')!='1' or not os.environ.get('LOCAL_API_TOKEN'):
        return jsonify(error='The credential vault is available in the installed application'),403

@vault_bp.route('/api/projects/<project_id>/vault',methods=['GET','PUT'])
@vault_bp.route('/api/projects/<project_id>/vault/<name>',methods=['DELETE'])
def credentials(project_id,name=None):
    try:
        user_id=request.args.get('user_id')
        if request.method=='GET':return jsonify(vault.names(project_id,user_id))
        if request.method=='DELETE':
            vault.owner(project_id,user_id)
            local_store.delete('credential',f'{project_id}:{name}')
            return jsonify(success=True)
        data=request.get_json(silent=True)
        if not isinstance(data,dict):raise ValueError('A variable name and value are required')
        return jsonify(vault.save(project_id,user_id,data.get('name'),data.get('value')))
    except ValueError as error:return jsonify(error=str(error)),400
