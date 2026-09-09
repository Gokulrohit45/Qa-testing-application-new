"""Local, user-started single-tab browser recording. Drafts are never executed or saved automatically."""
import threading
import time
import uuid
from core.test_contract import valid_url,validate_steps

JOBS={}
LOCK=threading.RLock()
SCRIPT=r'''(() => {
  if(window.top!==window)return;
  const target = el => {
    const testid=el.getAttribute('data-testid');if(testid)return 'testid:'+testid;
    const label=el.getAttribute('aria-label') || (el.labels?.[0]?.textContent || '').trim();if(label)return 'label:'+label;
    const text=(el.textContent||'').trim().replace(/\s+/g,' ');
    if(el.tagName==='BUTTON' && text && text.length<160)return 'role:button:'+text;
    if(el.id)return 'css:#'+CSS.escape(el.id);
    if(el.getAttribute('placeholder'))return 'placeholder:'+el.getAttribute('placeholder');
    if(text && text.length<160)return 'text:'+text;
    return null;
  };
  const send=(step)=>window.__qaRecord(step).catch(()=>{});
  document.addEventListener('click',e=>{
    if(!e.isTrusted)return;
    const el=e.target.closest('button,a,[role="button"],input[type="checkbox"],input[type="radio"]');
    if(!el)return;
    const key=target(el);if(key)send({action:'click',target:key,value:''});
  },true);
  document.addEventListener('change',e=>{
    if(!e.isTrusted)return;
    const el=e.target;if(!el.matches('input,textarea,select') || ['checkbox','radio','file','hidden'].includes(el.type))return;
    const key=target(el);if(!key)return;
    const secret=el.type==='password'||/password|secret|token|otp/i.test([el.name,el.id,el.autocomplete,key].join(' '));
    const value=secret?'{{test_password}}':el.tagName==='SELECT'?(el.selectedOptions[0]?.label||''):el.value;
    send({action:el.tagName==='SELECT'?'select':'fill',target:key,value});
  },true);
})();'''

def clean_event(event):
    if not isinstance(event,dict) or event.get('action') not in ('click','fill','select'):raise ValueError('Unsupported recorded action')
    target=event.get('target');value=event.get('value','')
    if not isinstance(target,str) or not target or len(target)>500 or not isinstance(value,str) or len(value)>5000:raise ValueError('Invalid recorded field')
    import re
    if event['action']=='fill' and re.search('password|secret|token|otp',target,re.I):value='{{test_password}}'
    clean={'action':event['action'],'target':target,'value':value}
    errors,_=validate_steps([clean],allow_variables=True)
    if errors:raise ValueError('Recorded action needs manual authoring')
    return clean

def run(job,url,headless=False):
    from playwright.sync_api import sync_playwright
    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch(headless=headless)
            try:
                context=browser.new_context(viewport={'width':1280,'height':850})
                page=context.new_page()
                def capture(source,event):
                    if source['page']!=page or source['frame']!=page.main_frame:return
                    try:step=clean_event(event)
                    except ValueError:return
                    with LOCK:
                        signature=(step['action'],step['target'],step['value'])
                        now=time.monotonic()
                        if signature==job.get('_last_signature') and now-job.get('_last_capture',0)<1:
                            return
                        job['_last_signature']=signature;job['_last_capture']=now
                        if len(job['steps'])<100:job['steps'].append(step)
                        else:job['warning']='Recording reached 100 steps. Stop and review the draft.'
                context.expose_binding('__qaRecord',capture)
                context.add_init_script(SCRIPT)
                page.goto(url,timeout=30000,wait_until='domcontentloaded')
                with LOCK:job['status']='recording'
                while not job['stop'].is_set() and not page.is_closed() and time.monotonic()-job['started']<1800:
                    page.wait_for_timeout(100)
                with LOCK:job['status']='stopping'
            finally:browser.close()
        with LOCK:job['status']='review'
    except Exception:
        with LOCK:job.update(status='failed',error='Recording could not continue. Check the browser URL and local runtime. Your captured draft is retained.')

def start(project_id,user_id,url):
    if not valid_url(url):raise ValueError('Enter a valid HTTP or HTTPS application URL')
    with LOCK:
        if any(j['status'] in ('starting','recording','stopping') for j in JOBS.values()):raise ValueError('Stop the current recording first')
        for key in list(JOBS)[:-10]:del JOBS[key]
        job={'id':str(uuid.uuid4()),'project_id':project_id,'user_id':user_id,'status':'starting','steps':[{'action':'goto','target':url,'value':''}],
             'started':time.monotonic(),'stop':threading.Event(),'warning':'Review every step and add outcome assertions. Password inputs use a protected variable; values are not recorded. Single-tab interactions are supported.'}
        JOBS[job['id']]=job
        threading.Thread(target=run,args=(job,url),daemon=True).start()
        return snapshot(job['id'],user_id)

def snapshot(identifier,user_id):
    with LOCK:
        job=JOBS.get(identifier)
        if not job or job['user_id']!=user_id:return None
        return {key:list(value) if key=='steps' else value for key,value in job.items() if key not in ('started','stop','user_id','_last_signature','_last_capture')}

def stop(identifier,user_id):
    with LOCK:
        job=JOBS.get(identifier)
        if not job or job['user_id']!=user_id:return False
        if job['status'] in ('starting','recording'):
            job['status']='stopping';job['stop'].set()
        return True
