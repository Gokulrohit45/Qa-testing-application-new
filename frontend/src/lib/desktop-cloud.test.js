import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesktopCloud} from './desktop-cloud.js';
function fixture({remote=null,hash='local',state={revision:0},payload={project:{id:'p'}}}={}) {
  const calls=[];let snap={payload,fingerprint:hash,state};let cloud=remote;
  const builder={select(){return this;},eq(){return this;},async maybeSingle(){return {data:cloud};}};
  const supabase={from:()=>builder,rpc:async(name,args)=>{calls.push({name,args});if((cloud?.revision||0)!==args.p_expected_revision)return {error:{code:'40001',message:'conflict'}};cloud={revision:args.p_expected_revision+1,payload:args.p_payload};return {data:cloud};}};
  const local=async(url,options)=>{if(!options)return snap;const data=JSON.parse(options.body);calls.push({url,data});if(url.includes('sync-state'))snap.state=data;else snap={...snap,payload:data.payload,fingerprint:'downloaded'};return {};};
  const service=createDesktopCloud({local,supabase,getSession:async()=>({user:{id:'u'}})});
  return {service,calls,get snap(){return snap;},supabase};
}
test('new workspace upload records exact acknowledged fingerprint',async()=>{const f=fixture();await f.service.sync('p');assert.equal(f.calls[0].args.p_expected_revision,0);assert.equal(f.snap.state.fingerprint,'local');});
test('divergent cloud revision does not silently overwrite either copy',async()=>{const f=fixture({remote:{revision:2,payload:{}},state:{revision:1,fingerprint:'old'}});await assert.rejects(f.service.sync('p'),{code:'SYNC_CONFLICT'});assert.equal(f.calls.length,0);});
test('clean local copy accepts newer cloud version',async()=>{const f=fixture({hash:'same',state:{revision:1,fingerprint:'same'},remote:{revision:2,payload:{project:{id:'p'}}}});assert.equal((await f.service.sync('p')).direction,'downloaded');assert.equal(f.snap.state.revision,2);});
test('explicit local conflict choice uses latest revision precondition',async()=>{const f=fixture({remote:{revision:3,payload:{}},state:{revision:1,fingerprint:'old'}});await f.service.sync('p','local');assert.equal(f.calls[0].args.p_expected_revision,3);});
test('cloud tombstone does not delete the local project',async()=>{const f=fixture({remote:{revision:2,deleted:true}});await assert.rejects(f.service.sync('p'),{code:'SYNC_CONFLICT'});assert.equal(f.calls.length,0);});
test('concurrent server update surfaces conflict and never acknowledges stale local state',async()=>{const f=fixture();f.supabase.rpc=async()=>({error:{code:'40001'}});await assert.rejects(f.service.sync('p'),{code:'SYNC_CONFLICT'});assert.equal(f.snap.state.revision,0);});
test('new device can restore workspace before uploading anything',async()=>{const f=fixture({payload:null,hash:null,remote:{revision:4,payload:{project:{id:'p'}}}});assert.equal((await f.service.sync('p')).direction,'downloaded');assert.equal(f.snap.state.revision,4);});
