const { _electron: electron } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(root, '.test-results/startup-profile-'));
const executablePath = path.join(root, '.test-results/installer-v2/win-unpacked/QA-AI Platform Preview.exe');
const expectedVersion = require(path.join(root, 'frontend/electron/preview-builder.cjs')).extraMetadata.version;
(async () => {
  for (const mode of ['fresh', 'corrupt-cache']) {
    if (mode === 'corrupt-cache') fs.writeFileSync(path.join(profile, 'public-cloud-config.json'), '{broken');
    const env = {...process.env, QA_AI_PREVIEW_DATA_DIR: profile};
    for (const key of Object.keys(env)) if (key === 'ELECTRON_RUN_AS_NODE' || key.startsWith('QA_AI_TEST_') || key === 'QA_AI_TEST_ENVIRONMENT' || key === 'QA_AI_SUPABASE_URL' || key === 'QA_AI_SUPABASE_ANON_KEY') delete env[key];
    let app;
    let childPids=[];
    try {
      app = await electron.launch({executablePath, env, timeout:90000});
      console.log('Launched isolated Electron: '+mode);
      const page = await app.firstWindow({timeout:90000});
      console.log('Window created: '+mode);
      await page.context().setOffline(true);
      await page.getByRole('heading', {name:'Welcome Back'}).waitFor({state:'visible',timeout:30000});
      assert.ok(await page.getByRole('button', {name:'Sign In to Workspace'}).isEnabled());
      childPids = await app.evaluate(() => process._getActiveHandles().filter(handle => handle.pid).map(handle => handle.pid));
      const all = JSON.parse(require('node:child_process').execFileSync('powershell.exe', ['-NoProfile','-Command','Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress'], {encoding:'utf8',windowsHide:true}));
      for (let i=0; i<childPids.length; i++) for (const item of all) if(item.ParentProcessId===childPids[i] && !childPids.includes(item.ProcessId)) childPids.push(item.ProcessId);
      const info = await app.evaluate(({app}) => ({name:app.getName(),version:app.getVersion(),data:app.getPath('userData')}));
      assert.equal(info.version, expectedVersion);
      assert.equal(path.resolve(info.data), path.resolve(profile));
      if (mode === 'fresh') assert.ok(!fs.existsSync(path.join(profile, 'public-cloud-config.json')), 'Startup unexpectedly fetched cloud configuration');
      else assert.equal(fs.readFileSync(path.join(profile, 'public-cloud-config.json'),'utf8'),'{broken');
      const url = await page.evaluate(()=>window.qaDesktop.supabaseUrl);
      assert.ok(url.startsWith('https://') && !url.includes('placeholder'));
      await page.screenshot({path:path.join(root, `.test-results/recovery/startup-${mode}.png`)});
      console.log(`Packaged Electron ${mode}: login visible offline, correct ${expectedVersion}, isolated data, bundled configuration used.`);
    } finally {
      if (app) {
        let timer;
        try { await Promise.race([app.close(), new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('App shutdown timed out')),15000);})]); }
        finally {clearTimeout(timer);}
        for (const pid of childPids) {
          let alive=true;try {process.kill(pid,0);} catch {alive=false;}
          assert.equal(alive,false,`Engine process ${pid} remained after closing the app`);
        }
        console.log('Shutdown completed without an orphaned engine.');
      }
    }
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
