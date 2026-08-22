const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess;
let shuttingDown = false;
const CLOUD_API_URL = 'https://qa-testing-application-new.onrender.com/api';

function validPublicConfig(value) {
  return Boolean(value && /^https:\/\//i.test(value.supabase_url || '') && typeof value.supabase_anon_key === 'string' && value.supabase_anon_key.length > 20);
}

function downloadPublicConfig() {
  return new Promise((resolve, reject) => {
    const request = https.get(`${CLOUD_API_URL}/public-config`, { timeout: 15000 }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { if (body.length < 100000) body += chunk; });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (response.statusCode !== 200 || !validPublicConfig(parsed)) throw new Error('Cloud returned an invalid public configuration');
          resolve(parsed);
        } catch (error) { reject(error); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('Cloud configuration request timed out')));
    request.on('error', reject);
  });
}

async function getPublicConfig() {
  const injected = {
    supabase_url: process.env.QA_AI_SUPABASE_URL,
    supabase_anon_key: process.env.QA_AI_SUPABASE_ANON_KEY
  };
  if (validPublicConfig(injected)) return injected;
  const cachePath = path.join(app.getPath('userData'), 'public-cloud-config.json');
  try {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (validPublicConfig(cached)) return cached;
  } catch (_error) {}
  const downloaded = await downloadPublicConfig();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(downloaded), { encoding: 'utf8', mode: 0o600 });
  return downloaded;
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function backendTarget() {
  if (app.isPackaged) {
    const exe = path.join(process.resourcesPath, 'python_engine', 'qa-ai-engine.exe');
    if (!fs.existsSync(exe)) throw new Error(`The local testing engine is missing: ${exe}`);
    return { command: exe, args: [], cwd: path.dirname(exe) };
  }
  const script = path.join(__dirname, '..', '..', 'backend', 'app.py');
  const venvPython = path.join(path.dirname(script), 'venv', 'Scripts', 'python.exe');
  return {
    command: fs.existsSync(venvPython) ? venvPython : 'python',
    args: [script], cwd: path.dirname(script)
  };
}

function startBackend(port, token) {
  const target = backendTarget();
  return new Promise((resolve, reject) => {
    let spawned = false;
    const child = spawn(target.command, target.args, {
      cwd: target.cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: String(port), LOCAL_API_TOKEN: token, QA_AI_DESKTOP: '1', PYTHONUNBUFFERED: '1',
        QA_AI_DATA_DIR: path.join(app.getPath('userData'), 'engine-data'),
        PLAYWRIGHT_BROWSERS_PATH: app.isPackaged ? path.join(process.resourcesPath, 'playwright-browsers') : process.env.PLAYWRIGHT_BROWSERS_PATH }
    });
    backendProcess = child;
    child.stdout.on('data', data => console.log(`[engine] ${String(data).trimEnd()}`));
    child.stderr.on('data', data => console.error(`[engine] ${String(data).trimEnd()}`));
    child.once('spawn', () => { spawned = true; resolve(); });
    child.once('error', error => { if (!spawned) reject(error); });
    child.once('exit', code => {
      backendProcess = undefined;
      if (!shuttingDown && mainWindow && !mainWindow.isDestroyed()) {
        dialog.showErrorBox('Testing engine stopped', `The local engine exited unexpectedly (code ${code}). Restart the application.`);
      }
    });
  });
}

function waitForBackend(port, token, timeoutMs = 45000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const retry = () => {
      if (Date.now() - started >= timeoutMs) return reject(new Error('The local engine did not become ready within 45 seconds.'));
      setTimeout(attempt, 300);
    };
    const attempt = () => {
      const req = http.get({ hostname: '127.0.0.1', port, path: '/api/health', headers: { 'X-QA-AI-Token': token }, timeout: 1500 }, response => {
        response.resume();
        response.statusCode === 200 ? resolve() : retry();
      });
      req.on('timeout', () => req.destroy());
      req.on('error', retry);
    };
    attempt();
  });
}

function createWindow(port, token, publicConfig) {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 720,
    title: 'QA-AI Autonomous Testing Platform', backgroundColor: '#0B0F17', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false,
      contextIsolation: true, sandbox: true,
      additionalArguments: [
        `--qa-ai-port=${port}`, `--qa-ai-token=${token}`,
        `--qa-ai-supabase-url=${publicConfig.supabase_url}`,
        `--qa-ai-supabase-anon-key=${publicConfig.supabase_anon_key}`,
        `--qa-ai-cloud-api-url=${CLOUD_API_URL}`
      ]
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  if (!app.isPackaged) mainWindow.loadURL('http://localhost:5173');
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(async () => {
  try {
    const port = await reservePort();
    const token = crypto.randomBytes(32).toString('hex');
    const publicConfig = await getPublicConfig();
    await startBackend(port, token);
    await waitForBackend(port, token);
    createWindow(port, token, publicConfig);
  } catch (error) {
    dialog.showErrorBox('QA-AI could not start', `${error.message}\n\nPlease reinstall the application or contact support.`);
    app.quit();
  }
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  shuttingDown = true;
  if (backendProcess && !backendProcess.killed) backendProcess.kill();
});
