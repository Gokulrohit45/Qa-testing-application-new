import os
from flask import Blueprint,request,jsonify
from core import web_recorder
from core.credential_vault import owner
recording_bp=Blueprint('recording',__name__)
@recording_bp.before_request
def require_device():
    if os.environ.get('QA_AI_DESKTOP')!='1' or not os.environ.get('LOCAL_API_TOKEN'):
        return jsonify(error='Recording is available in the installed application'),403
@recording_bp.route('/api/recordings',methods=['POST'])
def start():
    try:
        data=request.get_json(silent=True)
        if not isinstance(data,dict) or data.get('confirmed') is not True:raise ValueError('Confirm recording before opening the test browser')
        project=owner(data.get('project_id'),data.get('user_id'))
        if project.get('project_type','web')!='web':raise ValueError('Browser recording requires a web project')
        return jsonify(web_recorder.start(project['id'],data['user_id'],data.get('url'))),202
    except ValueError as error:return jsonify(error=str(error)),400
@recording_bp.route('/api/recordings/<identifier>',methods=['GET'])
def status(identifier):
    result=web_recorder.snapshot(identifier,request.args.get('user_id'))
    return (jsonify(result),200) if result else (jsonify(error='Recording not found'),404)
@recording_bp.route('/api/recordings/<identifier>/stop',methods=['POST'])
def stop(identifier):
    result=web_recorder.stop(identifier,request.args.get('user_id'))
    return (jsonify(stopping=True),202) if result else (jsonify(error='Recording not found'),404)
