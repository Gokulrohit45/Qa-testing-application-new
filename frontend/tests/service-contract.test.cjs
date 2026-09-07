const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

async function fixture(failLocal = false) {
  const calls = [];
  const cache = new Map();
  const project = {id:'desktop-project', user_id:'owner', project_type:'desktop', name:'Desktop', sync_state:'local_only'};
  const context = vm.createContext({
    window: {qaDesktop:{localApiUrl:'http://127.0.0.1:1/api',localApiToken:'dummy-token'}},
    localStorage: {getItem:k=>cache.get(k) || null, setItem:(k,v)=>cache.set(k,v), removeItem:k=>cache.delete(k)},
    crypto: {randomUUID:()=> 'new-desktop'}, Headers, AbortController, setTimeout, clearTimeout, console,
    fetch: async (url, options) => {
      calls.push({url,options});
      assert.equal(options.headers.get('X-QA-AI-Token'),'dummy-token');
      if (failLocal) throw new Error('local unavailable');
      const body = options.body ? JSON.parse(options.body) : {};
      return {ok:true, json:async()=>options.method === 'DELETE' ? {success:true} : options.method ? {...project,...body} : [project]};
    }
  });
  const supabase = {auth:{getSession:async()=>({data:{session:{user:{id:'owner'}}}})},
    from:()=> {throw new Error('Desktop mutation must not call cloud');},
    storage:{from:()=> {throw new Error('Desktop mutation must not call storage');}}};
  const stub = new vm.SyntheticModule(['supabase'],function(){this.setExport('supabase',supabase);},{context});
  const http = new vm.SourceTextModule(fs.readFileSync(path.join(__dirname,'../src/lib/http.js'),'utf8'),{context});
  const cloud = new vm.SourceTextModule(fs.readFileSync(path.join(__dirname,'../src/lib/desktop-cloud.js'),'utf8'),{context});
  const api = new vm.SourceTextModule(fs.readFileSync(path.join(__dirname,'../src/services/api.js'),'utf8'),{
    context, initializeImportMeta: meta => {meta.env={};}
  });
  await api.link(specifier => specifier.includes('supabaseClient') ? stub : specifier.includes('desktop-cloud') ? cloud : http);
  await api.evaluate();
  return {service:api.namespace.ProjectService,calls,cache};
}

test('desktop update is local-only and caches authoritative response', async()=>{
  const {service,calls,cache}=await fixture();
  const updated=await service.updateProject('desktop-project',{name:'Renamed'});
  assert.equal(updated.name,'Renamed');
  assert.equal(updated.sync_state,'local_only');
  assert.equal(calls.length,2);
  assert.equal(JSON.parse(cache.get('qa_projects'))[0].name,'Renamed');
});
test('desktop deletion does not depend on cloud or storage',async()=>{
  const {service,calls}=await fixture();
  await service.deleteProject('desktop-project');
  assert.equal(calls.length,2);
  assert.equal(calls[1].options.method,'DELETE');
});
test('unknown local state blocks mutation instead of falling through to cloud',async()=>{
  const {service,calls}=await fixture(true);
  await assert.rejects(service.updateProject('desktop-project',{name:'Renamed'}),/local unavailable/);
  assert.equal(calls.length,1);
});

async function cloudProjectFixture() {
  const calls=[];
  const cloudProject={id:'web-project',user_id:'owner',project_type:'web',name:'Cloud web project',app_name:'Cloud web project',app_url:'https://example.com'};
  const context=vm.createContext({window:{qaDesktop:{localApiUrl:'http://127.0.0.1:1/api',localApiToken:'dummy-token'}},localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},crypto:{randomUUID:()=> 'asset-id'},Headers,AbortController,setTimeout,clearTimeout,console,fetch:async(url,options)=>{calls.push({url,options});const body=options.body?JSON.parse(options.body):null;return {ok:true,json:async()=>options.method==='POST'?body:[]};}});
  const query={select(){return this;},eq(){return this;},async maybeSingle(){return {data:cloudProject,error:null};}};
  const supabase={auth:{getSession:async()=>({data:{session:{user:{id:'owner'}}}})},from:()=>query,storage:{from:()=>({})}};
  const stub=new vm.SyntheticModule(['supabase'],function(){this.setExport('supabase',supabase);},{context});
  const http=new vm.SourceTextModule(fs.readFileSync(path.join(__dirname,'../src/lib/http.js'),'utf8'),{context});
  const cloud=new vm.SourceTextModule(fs.readFileSync(path.join(__dirname,'../src/lib/desktop-cloud.js'),'utf8'),{context});
  const api=new vm.SourceTextModule(fs.readFileSync(path.join(__dirname,'../src/services/api.js'),'utf8'),{context,initializeImportMeta:meta=>{meta.env={};}});
  await api.link(specifier=>specifier.includes('supabaseClient')?stub:specifier.includes('desktop-cloud')?cloud:http);await api.evaluate();
  return {service:api.namespace.ProjectService,calls};
}

test('fresh install mirrors an owned Supabase web project into the local engine',async()=>{
  const {service,calls}=await cloudProjectFixture();
  const mirrored=await service.ensureLocalProject('web-project');
  assert.equal(mirrored.id,'web-project');assert.equal(mirrored.user_id,'owner');assert.equal(mirrored.sync_state,'synced');
  assert.equal(calls.length,2);assert.match(calls[0].url,/projects\?user_id=owner$/);assert.equal(calls[1].options.method,'POST');
});
