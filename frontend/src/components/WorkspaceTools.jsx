import React, {useEffect,useState} from 'react';
import {Cloud,CloudOff,RefreshCw,ShieldCheck,KeyRound,Plus,Trash2,CheckCircle2} from 'lucide-react';
import {DesktopCloudService,VaultService} from '../services/api';

export default function WorkspaceTools({project,disabled=false,revision=0,onRestored=()=>{}}) {
  const desktop=project.project_type==='desktop';
  const [status,setStatus]=useState('pending');const [message,setMessage]=useState('');
  const [syncing,setSyncing]=useState(false);const [conflict,setConflict]=useState(false);
  const [secrets,setSecrets]=useState([]);const [name,setName]=useState('');const [value,setValue]=useState('');
  const [vaultError,setVaultError]=useState('');const [saving,setSaving]=useState(false);
  async function sync(choice) {
    if(disabled||syncing)return;
    setSyncing(true);setMessage('Connecting to your cloud workspace…');setConflict(false);
    try {
      const result=await DesktopCloudService.sync(project.id,choice);
      setStatus('synced');setMessage(`Saved to your account · revision ${result.revision}`);
      window.dispatchEvent(new CustomEvent('qa-cloud-sync',{detail:{id:project.id,status:'synced'}}));
      if(result.direction==='downloaded')await onRestored();
    } catch(error) {
      setStatus('pending');setMessage(error.code==='SYNC_CONFLICT'?error.message:'Saved on this computer. Cloud sync needs attention: '+error.message);
      setConflict(error.code==='SYNC_CONFLICT' && !error.remote?.deleted);
      window.dispatchEvent(new CustomEvent('qa-cloud-sync',{detail:{id:project.id,status:'pending'}}));
    } finally {setSyncing(false);}
  }
  useEffect(()=>{if(desktop&&!disabled)sync();},[project.id,revision,disabled]);
  async function loadVault(){try{setSecrets(await VaultService.list(project.id));setVaultError('');}catch(e){setVaultError(e.message);}}
  async function saveSecret(e){e.preventDefault();setSaving(true);setVaultError('');try{await VaultService.save(project.id,name,value);setValue('');setName('');await loadVault();}catch(e){setVaultError(e.message);}finally{setSaving(false);}}
  return <div className="workspace-tools grid gap-4 lg:grid-cols-2">
    {desktop && <section className="card p-5 space-y-3" aria-label="Workspace cloud synchronization">
      <div className="flex justify-between items-center gap-3"><div className="flex gap-3 items-center"><span className="tool-icon"><Cloud size={20}/></span><div><h2 className="font-bold">Your cloud workspace</h2><p className="text-xs text-secondary">Your account · Your devices · Revision history</p></div></div><button className="btn-ghost" disabled={disabled||syncing} onClick={()=>sync()}><RefreshCw size={15} className={syncing?'animate-spin':''}/>{syncing?'Syncing…':'Sync now'}</button></div>
      <p className={`text-sm flex items-start gap-2 ${status==='synced'?'text-emerald-600 dark:text-emerald-400':'text-secondary'}`} role="status">{status==='synced'?<CheckCircle2 size={16}/>:<CloudOff size={16}/>}<span>{message||'Ready to connect your saved tests, suites and results.'}</span></p>
      <p className="text-xs text-muted">Test definitions and input values synchronize. Store passwords in the device vault and use variable references in your steps.</p>
      {conflict && <div className="flex gap-2 flex-wrap"><button disabled={syncing||disabled} className="btn-ghost" onClick={()=>sync('local')}>Keep this computer's copy</button><button disabled={syncing||disabled} className="btn-ghost" onClick={()=>sync('cloud')}>Restore cloud copy</button></div>}
    </section>}
    <details className="card p-5 space-y-4" onToggle={e=>{if(e.currentTarget.open)loadVault();}}>
      <summary className="flex items-center gap-3 cursor-pointer"><span className="tool-icon"><ShieldCheck size={20}/></span><div><h2 className="font-bold">Protected test credentials</h2><p className="text-xs text-secondary">Encrypted on this device · Values never sync</p></div></summary>
      <p className="text-sm text-secondary">Save test credentials here and reference them as <code>{'{{variable_name}}'}</code> in your test. Configure the same variable names on another computer before running.</p>
      {vaultError&&<p role="alert" className="text-sm text-red-500">{vaultError}</p>}
      {secrets.map(secret=><div key={secret.name} className="flex justify-between items-center gap-3 text-sm"><code>{`{{${secret.name}}}`}</code><button aria-label={`Delete credential ${secret.name}`} disabled={disabled||saving} onClick={async()=>{try{await VaultService.remove(project.id,secret.name);await loadVault();}catch(e){setVaultError(e.message);}}}><Trash2 size={15}/></button></div>)}
      <form onSubmit={saveSecret} className="grid gap-3"><input aria-label="Credential variable name" className="input-field" placeholder="e.g. test_password" pattern="[A-Za-z_][A-Za-z0-9_]*" required maxLength={64} disabled={disabled||saving} value={name} onChange={e=>setName(e.target.value)}/><input type="password" aria-label="Credential value" autoComplete="new-password" className="input-field" placeholder="Protected value" required disabled={disabled||saving} value={value} onChange={e=>setValue(e.target.value)}/><button className="btn-primary" disabled={disabled||saving}><KeyRound size={15}/>{saving?'Protecting…':'Save protected credential'}</button></form>
    </details>
  </div>;
}
