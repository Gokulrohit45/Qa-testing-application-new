import React,{useEffect,useState} from 'react';
import {Circle,Square,Video,Sparkles,ArrowRight} from 'lucide-react';
import {RecordingService,VideoDraftService} from '../services/api';
export default function DraftTools({project,onDraft,disabled=false}) {
  const desktop=project.project_type==='desktop';
  const key=`qa-recording-${project.id}`;
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
  return <section className="card p-6 space-y-5" aria-label="Capture a test draft">
    <div><p className="text-xs uppercase tracking-widest text-indigo-500 font-bold">Capture once. Test with confidence.</p><h2 className="text-xl font-bold mt-1">Turn your workflow into a test</h2><p className="text-sm text-secondary mt-2">Record browser actions or turn a short test video into a draft. Review and add outcome checks before saving.</p></div>
    <div className="grid gap-5 md:grid-cols-2">
      {!desktop&&<div className="space-y-3"><h3 className="font-semibold flex gap-2 items-center"><Circle size={16} className="text-rose-500"/> Browser recorder</h3><input aria-label="Recording start URL" type="url" className="input-field" value={url} onChange={e=>setUrl(e.target.value)} disabled={recording||busy||disabled}/><p className="text-xs text-muted">A separate test browser opens. Record a single tab using disposable test data. Passwords become vault variables. Leaving this panel stops capture.</p><div className="flex gap-3"><button className="btn-primary" disabled={busy||recording||disabled||!url} onClick={start}>Start recording</button><button className="btn-ghost" disabled={!recording||job?.status==='stopping'} onClick={async()=>{try{await RecordingService.stop(recordingId);setJob({...job,status:'stopping'});}catch(e){setError(e.message);}}}><Square size={14}/>Stop & review</button></div>{job&&<p className="text-sm text-secondary" role="status">{job.status} · {job.steps?.length||0} captured steps</p>}</div>}
      <div className="space-y-3"><h3 className="font-semibold flex gap-2 items-center"><Video size={16}/> Video to test</h3><input aria-label="Test recording video" type="file" accept="video/mp4,video/webm,video/quicktime" disabled={busy||recording||disabled} onChange={e=>{setFile(e.target.files[0]||null);setConsent(false);}}/><p className="text-xs text-muted">MP4, WebM or MOV · up to 20 MB. Use a short, clear recording with no real credentials or personal data.</p><label className="flex gap-2 text-xs text-secondary"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>I authorize sending this test recording to our cloud backend and configured AI provider for analysis.</label><button className="btn-primary" disabled={!file||!consent||busy||recording||disabled} onClick={analyze}><Sparkles size={15}/>{busy?'Preparing draft…':'Generate draft'}</button></div>
    </div>
    {error&&<p role="alert" className="text-sm text-red-500">{error}</p>}
    {draft&&<div className="space-y-3 border-t border-indigo-500/20 pt-4"><h3 className="font-bold">Your draft is ready for review</h3>{draft.warnings?.map((text,i)=><p key={i} className="text-xs text-secondary">{text}</p>)}<ol className="max-h-56 overflow-auto space-y-2">{draft.steps.map((step,i)=><li key={i} className="text-sm text-secondary">{i+1}. {step.action} · {typeof step.target==='object'?Object.values(step.target).join(' / '):step.target}</li>)}</ol><button className="btn-primary" disabled={disabled||recording} onClick={()=>onDraft(draft.steps)}>Review in test editor <ArrowRight size={15}/></button></div>}
  </section>;
}
