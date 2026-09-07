// Cloud operations use the signed-in Supabase session and owner RLS. The local vault is never included.
export function createDesktopCloud({local, supabase, getSession}) {
  const pending = new Map();
  const requireUser = async () => {
    const session = await getSession();
    if (!session?.user?.id) throw new Error('Sign in to synchronize your workspace');
    return session.user.id;
  };
  const unwrap = response => {
    if (response.error) throw Object.assign(new Error(response.error.message || 'Cloud request failed'), {code:response.error.code});
    return response.data;
  };
  const endpoint = (id, user, suffix) => `/desktop/projects/${encodeURIComponent(id)}/${suffix}?user_id=${encodeURIComponent(user)}`;
  const read = async (id,user) => unwrap(await supabase.from('desktop_workspaces').select('*').eq('id',id).eq('user_id',user).maybeSingle());
  const conflict = (message,remote) => Object.assign(new Error(message), {code:'SYNC_CONFLICT', remote});
  async function sync(id, choice) {
    const user = await requireUser();
    const snapshot = await local(endpoint(id,user,'snapshot'));
    const remote = await read(id,user);
    if (remote?.deleted) throw conflict('This workspace was deleted in the cloud. Your local copy has been kept.',remote);
    const state = snapshot.state || {revision:0};
    const localChanged = snapshot.fingerprint !== state.fingerprint;
    if (remote && (!snapshot.payload || remote.revision !== state.revision)) {
      if (snapshot.payload && localChanged && choice !== 'cloud' && choice !== 'local') {
        throw conflict('Both local and cloud copies have changes. Choose which copy to keep. An encrypted local backup is made before a cloud copy is restored.',remote);
      }
      if (!snapshot.payload || !localChanged || choice === 'cloud') {
        await local(endpoint(id,user,'snapshot'), {method:'PUT',body:JSON.stringify({payload:remote.payload,expected_fingerprint:snapshot.fingerprint})});
        const restored = await local(endpoint(id,user,'snapshot'));
        await local(endpoint(id,user,'sync-state'),{method:'PUT',body:JSON.stringify({revision:remote.revision,fingerprint:restored.fingerprint})});
        return {status:'synced',revision:remote.revision,direction:'downloaded'};
      }
    }
    if (!snapshot.payload) throw new Error('Workspace not found on this device or in your cloud account');
    if (!remote && state.revision) throw conflict('The cloud copy is unavailable. Local changes have been preserved.',null);
    if (remote && !localChanged && choice !== 'local') return {status:'synced',revision:remote.revision,direction:'unchanged'};
    const result=await supabase.rpc('save_desktop_workspace', {p_id:id,p_expected_revision:remote?.revision || 0,p_payload:snapshot.payload,p_deleted:false});
    if(result.error?.code==='40001') throw conflict('Another device saved while synchronization was running. Please review both copies.',remote);
    const saved=unwrap(result);
    await local(endpoint(id,user,'sync-state'),{method:'PUT',body:JSON.stringify({revision:saved.revision,fingerprint:snapshot.fingerprint})});
    return {status:'synced',revision:saved.revision,direction:'uploaded'};
  }
  return {
    async list() { const user=await requireUser(); return unwrap(await supabase.from('desktop_workspaces').select('id,revision,payload,updated_at').eq('user_id',user).eq('deleted',false)) || []; },
    sync(id, choice) {
      if(pending.has(id)) return pending.get(id);
      const operation=sync(id,choice).finally(()=>pending.delete(id));pending.set(id,operation);return operation;
    },
    async remove(id) {
      const user=await requireUser();const remote=await read(id,user);
      if(remote && !remote.deleted) unwrap(await supabase.rpc('save_desktop_workspace',{p_id:id,p_expected_revision:remote.revision,p_payload:remote.payload,p_deleted:true}));
    }
  };
}
