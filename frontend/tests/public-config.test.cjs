const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {validPublicConfig, getPublicConfig, downloadPublicConfig} = require('../electron/public-config.cjs');
const config = {supabase_url:'https://fixture.supabase.co',supabase_anon_key:'sb_publishable_fixture'};
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-config-test-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  return {env:{}, cachePath:path.join(dir,'cache.json'),bundledPath:path.join(dir,'bundle.json'),download:()=>{throw new Error('Network must not be called');}};
}
test('clean installation opens using bundled public settings with network unavailable', async t => {
  const options=fixture(t);fs.writeFileSync(options.bundledPath,JSON.stringify(config));
  assert.deepEqual(await getPublicConfig(options),config);
});
test('corrupted cache falls back to bundle, preserving public fields only', async t => {
  const options=fixture(t);fs.writeFileSync(options.cachePath,'broken');
  fs.writeFileSync(options.bundledPath,JSON.stringify({...config,private_field:'must not propagate'}));
  assert.deepEqual(await getPublicConfig(options),config);
});
test('existing valid cache works offline', async t => {
  const options=fixture(t);fs.writeFileSync(options.cachePath,JSON.stringify(config));
  assert.deepEqual(await getPublicConfig(options),config);
});
test('staging configuration never falls back to bundled production settings', async t => {
  const options=fixture(t);options.testConfig={supabase_url:'https://staging.example',supabase_anon_key:'fixture'};
  fs.writeFileSync(options.bundledPath,JSON.stringify(config));
  assert.equal(await getPublicConfig(options),options.testConfig);
});
test('privileged keys and malformed URLs are rejected', () => {
  const key = role => 'header.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.signature';
  assert.equal(validPublicConfig({...config,supabase_anon_key:key('service_role')}),false);
  assert.equal(validPublicConfig({...config,supabase_anon_key:key('anon')}),true);
  assert.equal(validPublicConfig({...config,supabase_url:'https://'}),false);
  assert.equal(validPublicConfig({...config,supabase_url:'http://fixture.supabase.co'}),false);
  assert.equal(validPublicConfig({...config,supabase_anon_key:'sb_secret_private'}),false);
});
test('cache write failure does not discard successfully downloaded public settings', async t => {
  const options=fixture(t);fs.mkdirSync(options.cachePath);options.download=async()=>config;
  assert.deepEqual(await getPublicConfig(options),config);
});
async function server(t, handler) {
  const srv=http.createServer(handler);await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));
  t.after(()=>{srv.closeAllConnections();srv.close();});
  return `http://127.0.0.1:${srv.address().port}`;
}
test('network deadline covers stalled response body', async t => {
  const url=await server(t,(_req,res)=>{res.writeHead(200);res.write('{');});
  await assert.rejects(downloadPublicConfig(url,50,http),/timed out/);
});
test('network fallback validates and returns only public fields', async t => {
  const url=await server(t,(_req,res)=>res.end(JSON.stringify({...config,extra:'omit'})));
  assert.deepEqual(await downloadPublicConfig(url,1000,http),config);
});
test('oversized network response is rejected', async t => {
  const url=await server(t,(_req,res)=>res.end('x'.repeat(100001)));
  await assert.rejects(downloadPublicConfig(url,1000,http),/too large|interrupted/);
});
