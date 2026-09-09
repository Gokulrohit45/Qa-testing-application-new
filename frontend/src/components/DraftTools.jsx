import React,{useEffect,useState} from 'react';
import {Circle,Square,Video,Sparkles,ArrowRight,UploadCloud,Radio} from 'lucide-react';
import {RecordingService,VideoDraftService} from '../services/api';

export default function DraftTools({project,onDraft,disabled=false}) {
  const desktop=project.project_type==='desktop';
  const key=`qa-recording-${project.id}`;
  const [mode,setMode]=useState(desktop?'video':'record');
  const [job,setJob]=useState(null);const [recordingId,setRecordingId]=useState(()=>sessionStorage.getItem(key)||'');
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [file,setFile]=useState(null);const [consent,setConsent]=useState(false);
  const [draft,setDraft]=useState(null);const [url,setUrl]=useState(project.app_url||'');
  useEffect(()=>{
    if(!recordingId)return;
    let active=true,timer;
    async function poll(){try{const value=await RecordingService.get(recordingId);if(!active)return;setJob(value);if(['starting','recording','stopping'].includes(value.status))timer=setTimeout(poll,700);else if(value.steps?.length)setDraft({steps:value.steps,warnings:[value.warning].filter(Boolean)});}catch(e){if(active)setError(e.message);}}
    poll();return()=>{active=false;clearTimeout(timer);RecordingService.stop(recordingId).catch(()=>{});};
  },[recordingId]);
  async function start(){setBusy(true);setError('');setDraft(null);try{const value=await RecordingService.start(project.id,url);setJob(value);sessionStorage.setItem(key,value.id);setRecordingId(value.id);}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function analyze(){if(!consent||!file)return;setBusy(true);setError('');setDraft(null);try{setDraft(await VideoDraftService.create(project,file));}catch(e){setError(e.details?.error||e.message);}finally{setBusy(false);}}
  const recording=['starting','recording','stopping'].includes(job?.status);
  return <section className="card capture-workspace p-6 space-y-5" aria-label="Capture a test draft">
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4"><div><p className="section-label text-indigo-500">Create from a workflow</p><h2 className="text-xl font-bold mt-1">Capture a new test</h2><p className="text-sm text-secondary mt-1">Choose one method. You can review every generated step before saving.</p></div>
      {!desktop&&<div className="capture-switch" role="tablist" aria-label="Test capture method"><button role="tab" aria-selected={mode==='record'} className={mode==='record'?'active':''} onClick={()=>setMode('record')}><Radio size={15}/>Browser recording</button><button role="tab" aria-selected={mode==='video'} className={mode==='video'?'active':''} onClick={()=>setMode('video')}><Video size={15}/>Video draft</button></div>}
    </div>
    {!desktop&&mode==='record'&&<div className="capture-panel"><div className="space-y-3"><h3 className="font-semibold flex gap-2 items-center"><Circle size={16} className="text-rose-500"/> Record browser actions</h3><input aria-label="Recording start URL" type="url" className="input-field" value={url} onChange={e=>setUrl(e.target.value)} disabled={recording||busy||disabled}/><p className="text-xs text-muted">A separate test browser opens. Use disposable test data; password fields are converted to protected variables.</p><div className="flex flex-wrap gap-3"><button className="btn-primary" disabled={busy||recording||disabled||!url} onClick={start}>Start recording</button><button className="btn-ghost" disabled={!recording||job?.status==='stopping'} onClick={async()=>{try{await RecordingService.stop(recordingId);setJob({...job,status:'stopping'});}catch(e){setError(e.message);}}}><Square size={14}/>Stop &amp; review</button></div>{job&&<p className="text-sm text-secondary" role="status">{job.status} · {job.steps?.length||0} captured steps</p>}</div></div>}
    {(desktop||mode==='video')&&<div className="capture-panel"><div className="space-y-3"><h3 className="font-semibold flex gap-2 items-center"><Video size={16}/> Turn a recording into a test</h3><label className="capture-dropzone"><UploadCloud size={25}/><span className="font-semibold">{file?file.name:'Choose a test recording'}</span><span>MP4, WebM or MOV · up to 100 MB</span><input aria-label="Test recording video" type="file" accept="video/mp4,video/webm,video/quicktime" disabled={busy||recording||disabled} onChange={e=>{setFile(e.target.files[0]||null);setConsent(false);}}/></label><label className="flex gap-2 text-xs text-secondary items-start"><input className="mt-0.5" type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>I authorize sending this test recording to our cloud backend and configured AI provider for analysis.</label><button className="btn-primary" disabled={!file||!consent||busy||recording||disabled} onClick={analyze}><Sparkles size={15}/>{busy?'Preparing draft…':'Generate draft'}</button></div></div>}
    {error&&<p role="alert" className="status-panel status-error">{error}</p>}
    {draft&&<div className="space-y-3 border-t border-indigo-500/20 pt-4"><h3 className="font-bold">Your draft is ready for review</h3>{draft.warnings?.map((text,i)=><p key={i} className="text-xs text-secondary">{text}</p>)}<ol className="max-h-56 overflow-auto space-y-2">{draft.steps.map((step,i)=><li key={i} className="text-sm text-secondary">{i+1}. {step.action} · {typeof step.target==='object'?Object.values(step.target).join(' / '):step.target}</li>)}</ol><button className="btn-primary" disabled={disabled||recording} onClick={()=>onDraft(draft.steps)}>Review in test editor <ArrowRight size={15}/></button></div>}
  </section>;
}
