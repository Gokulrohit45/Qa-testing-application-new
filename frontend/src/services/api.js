import { supabase } from '../supabaseClient';

// LOCAL Flask daemon (runs on user's desktop - handles execution, assets, test cases)
const desktopConfig = window.qaDesktop || {};
const LOCAL_FLASK_URL = desktopConfig.localApiUrl || import.meta.env.VITE_LOCAL_ENGINE_URL || 'http://127.0.0.1:5000/api';
const LOCAL_API_TOKEN = desktopConfig.localApiToken || '';

// CLOUD API (Render - handles Gemini AI translation and OTP auth)
const CLOUD_API_URL = desktopConfig.cloudApiUrl || import.meta.env.VITE_CLOUD_API_URL || 'https://qa-testing-application-new.onrender.com/api';

// Helper: call LOCAL Flask daemon (Playwright, uploads, test cases)
async function fetchLocal(endpoint, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 30000);
  const res = await fetch(`${LOCAL_FLASK_URL}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...(LOCAL_API_TOKEN ? { 'X-QA-AI-Token': LOCAL_API_TOKEN } : {}), ...options.headers },
    ...options,
    signal: options.signal || controller.signal,
  });
  clearTimeout(timer);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText}`);
  }
  return await res.json();
}

// Helper: call CLOUD API (Gemini, Brevo OTP)
async function fetchCloud(endpoint, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 30000);
  const res = await fetch(`${CLOUD_API_URL}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    signal: options.signal || controller.signal,
  });
  clearTimeout(timer);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText}`);
  }
  return await res.json();
}

// Normalized User Id extractor
export function getNormalizedUserId(session) {
  if (!session) return 'user_offline';
  return session.user?.id || session.user?.user_id || 'user_offline';
}

function pickFields(value, fields) {
  return Object.fromEntries(fields.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
}
const PROJECT_CLOUD_FIELDS = ['id', 'user_id', 'name', 'app_name', 'app_url', 'description', 'face_auth_enabled', 'created_at', 'updated_at'];
const TESTCASE_CLOUD_FIELDS = ['id', 'project_id', 'user_id', 'name', 'type', 'commands', 'cached_json', 'status', 'created_at', 'updated_at'];

// ─── AUTH SERVICE ──────────────────────────────────────────────────────────────
export const AuthenticationService = {
  async login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message || 'Login failed');
    if (!data.session) throw new Error('Login did not return a valid session');
    return { success: true, session: data.session, user: data.user, isOffline: false };
  },

  async register(email, password, fullName) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName } }
      });
      if (error) throw error;
      return { success: true, user: data.user };
    } catch (err) {
      return { success: false, error: err };
    }
  },

  async getCurrentSession() {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session) return data.session;
    } catch (e) {}
    localStorage.removeItem('qa_offline_session');
    return null;
  },

  async logout() {
    try { await supabase.auth.signOut(); } catch (e) {}
    localStorage.removeItem('qa_projects');
  },

  // OTP via Brevo → goes to CLOUD (has Brevo key)
  async sendOtp(email) {
    return await fetchCloud('/auth/send-otp', { method: 'POST', body: JSON.stringify({ email }) });
  },
  async verifyOtp(email, otp) {
    return await fetchCloud('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, otp }) });
  },
  async resetPasswordWithOtp(email, otp, newPassword) {
    return await fetchCloud('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email, otp, new_password: newPassword }) });
  },

  async getProfile() {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        const user = data.session.user;
        return {
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Workspace User',
          user_metadata: user.user_metadata,
        };
      }
    } catch (e) {}
    return null;
  }
};

// ─── PROJECT SERVICE ──────────────────────────────────────────────────────────
export const ProjectService = {
  async listProjects() {
    const projectsMap = new Map();
    const session = await AuthenticationService.getCurrentSession();
    if (!session?.user?.id) return [];
    const userId = session.user.id;

    // 1. Supabase Cloud DB first (Primary source of truth across all devices)
    try {
      const { data, error } = await supabase.from('projects').select('*').eq('user_id', userId);
      if (!error && Array.isArray(data)) {
        data.forEach(p => { if (p?.id) projectsMap.set(p.id, p); });
      }
    } catch (e) {}

    // 2. Local Flask daemon
    try {
      const localProjects = await fetchLocal(`/projects?user_id=${encodeURIComponent(userId)}`);
      if (Array.isArray(localProjects)) {
        for (const p of localProjects) {
          if (p?.sync_state === 'pending') {
            try {
              const { error } = await supabase.from('projects').upsert([pickFields(p, PROJECT_CLOUD_FIELDS)]);
              if (!error) {
                p.sync_state = 'synced'; delete p.sync_error;
                await fetchLocal(`/projects/${p.id}`, { method: 'PUT', body: JSON.stringify({ sync_state: 'synced' }) });
              }
            } catch (e) {}
          }
          if (p?.id && !projectsMap.has(p.id)) projectsMap.set(p.id, p);
        }
      }
    } catch (e) {}

    // 3. localStorage fallback
    try {
      const lsProjects = JSON.parse(localStorage.getItem('qa_projects') || '[]');
      lsProjects.filter(p => p.user_id === userId).forEach(p => { if (p?.id && !projectsMap.has(p.id)) projectsMap.set(p.id, p); });
    } catch (e) {}

    const result = Array.from(projectsMap.values());
    localStorage.setItem('qa_projects', JSON.stringify(result));
    return result;
  },

  async createProject(projectData) {
    const session = await AuthenticationService.getCurrentSession();
    const userId = getNormalizedUserId(session);
    if (!session?.user?.id) throw new Error('You must be signed in to create a project');
    const projId = projectData.id || crypto.randomUUID();
    const fullProject = { ...projectData, id: projId, user_id: userId, created_at: new Date().toISOString() };

    // 1. Save to Supabase Cloud DB
    try {
      const { error } = await supabase.from('projects').upsert([pickFields(fullProject, PROJECT_CLOUD_FIELDS)]);
      if (error) throw error;
    } catch (e) { fullProject.sync_state = 'pending'; fullProject.sync_error = e.message; }

    // 2. Save to Local Flask daemon
    try {
      await fetchLocal('/projects', { method: 'POST', body: JSON.stringify(fullProject) });
    } catch (e) {
      if (window.qaDesktop) throw new Error(`Local project save failed: ${e.message}`);
    }

    // 3. Save to localStorage
    try {
      const current = JSON.parse(localStorage.getItem('qa_projects') || '[]');
      current.unshift(fullProject);
      localStorage.setItem('qa_projects', JSON.stringify(current));
    } catch (e) {}

    return fullProject;
  },

  async updateProject(projectId, updates) {
    let syncError = null;
    const cloudUpdates = pickFields({ ...updates, updated_at: new Date().toISOString() }, PROJECT_CLOUD_FIELDS);
    try {
      const { error } = await supabase.from('projects').update(cloudUpdates).eq('id', projectId);
      if (error) throw error;
    } catch (e) { syncError = e; }
    await fetchLocal(`/projects/${projectId}`, { method: 'PUT', body: JSON.stringify({ ...updates, sync_state: syncError ? 'pending' : 'synced' }) });
    try {
      const current = JSON.parse(localStorage.getItem('qa_projects') || '[]');
      const updated = current.map(p => p.id === projectId ? { ...p, ...updates } : p);
      localStorage.setItem('qa_projects', JSON.stringify(updated));
      return { ...updated.find(p => p.id === projectId), sync_state: syncError ? 'pending' : 'synced', sync_error: syncError?.message };
    } catch (e) { return null; }
  },

  async deleteProject(projectId) {
    const { error } = await supabase.from('projects').delete().eq('id', projectId);
    if (error) throw new Error(`Cloud deletion failed: ${error.message}`);
    await fetchLocal(`/projects/${projectId}`, { method: 'DELETE' });
    const current = JSON.parse(localStorage.getItem('qa_projects') || '[]');
    localStorage.setItem('qa_projects', JSON.stringify(current.filter(p => p.id !== projectId)));
  }
};

// Helper: clean step targets (strip action prefixes like "verify_text ")
function sanitizeSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.map(s => {
    let cleanTarget = strVal(s.target);
    for (const prefix of ["verify_text ", "verify_text:", "verify ", "verify:", "assert ", "check "]) {
      if (cleanTarget.toLowerCase().startsWith(prefix)) {
        cleanTarget = cleanTarget.substring(prefix.length).trim();
      }
    }
    cleanTarget = cleanTarget.replace(/^["']|["']$/g, '').trim();
    return { ...s, target: cleanTarget };
  });
}
function strVal(v) { return v == null ? '' : String(v).trim(); }

// ─── TEST CASE SERVICE (Cloud First + Local Fallback) ─────────────────────────
export const TestCaseService = {
  async getTestCases(projectId) {
    const tcMap = new Map();
    const session = await AuthenticationService.getCurrentSession();
    if (!session?.user?.id) return [];

    // 1. Supabase Cloud DB
    try {
      const { data, error } = await supabase.from('test_cases').select('*').eq('project_id', projectId);
      if (!error && Array.isArray(data)) {
        data.forEach(tc => { if (tc?.id) tcMap.set(tc.id, { ...tc, cached_json: sanitizeSteps(tc.cached_json) }); });
      }
    } catch (e) {}

    // 2. Local Flask daemon
    try {
      const localTc = await fetchLocal(`/testcases?project_id=${projectId}&user_id=${encodeURIComponent(session.user.id)}`);
      if (Array.isArray(localTc)) {
        for (const tc of localTc) {
          if (tc?.sync_state === 'pending') {
            try {
              const { error } = await supabase.from('test_cases').upsert([pickFields(tc, TESTCASE_CLOUD_FIELDS)]);
              if (!error) {
                tc.sync_state = 'synced'; delete tc.sync_error;
                await fetchLocal(`/testcases/${tc.id}`, { method: 'PUT', body: JSON.stringify({ sync_state: 'synced' }) });
              }
            } catch (e) {}
          }
          if (tc?.id && !tcMap.has(tc.id)) {
            tcMap.set(tc.id, { ...tc, cached_json: sanitizeSteps(tc.cached_json) });
          }
        }
      }
    } catch (e) {}

    // 3. localStorage fallback
    try {
      const all = JSON.parse(localStorage.getItem('qa_testcases') || '[]');
      all.filter(tc => tc.project_id === projectId).forEach(tc => {
        if (tc?.id && !tcMap.has(tc.id)) {
          tcMap.set(tc.id, { ...tc, cached_json: sanitizeSteps(tc.cached_json) });
        }
      });
    } catch (e) {}

    return Array.from(tcMap.values());
  },

  async createTestCase(testCaseData) {
    const sanitizedJson = sanitizeSteps(testCaseData.cached_json);
    const session = await AuthenticationService.getCurrentSession();
    if (!session?.user?.id) throw new Error('You must be signed in to create a test case');
    const tcId = testCaseData.id || crypto.randomUUID();
    const fullTc = { ...testCaseData, id: tcId, user_id: session.user.id, cached_json: sanitizedJson, created_at: new Date().toISOString() };

    // 1. Supabase Cloud DB
    try {
      const { error } = await supabase.from('test_cases').upsert([pickFields(fullTc, TESTCASE_CLOUD_FIELDS)]);
      if (error) throw error;
    } catch (e) { fullTc.sync_state = 'pending'; fullTc.sync_error = e.message; }

    // 2. Local Flask daemon
    try { await fetchLocal('/testcases', { method: 'POST', body: JSON.stringify(fullTc) }); }
    catch (e) { if (window.qaDesktop) throw new Error(`Local test-case save failed: ${e.message}`); }

    // 3. localStorage
    try {
      const all = JSON.parse(localStorage.getItem('qa_testcases') || '[]');
      all.unshift(fullTc);
      localStorage.setItem('qa_testcases', JSON.stringify(all));
    } catch (e) {}

    return fullTc;
  },

  async updateTestCase(id, testCaseData) {
    const sanitizedJson = sanitizeSteps(testCaseData.cached_json);
    const updatedTc = { ...testCaseData, cached_json: sanitizedJson };

    let syncError = null;
    try {
      const { error } = await supabase.from('test_cases').update(pickFields(updatedTc, TESTCASE_CLOUD_FIELDS)).eq('id', id);
      if (error) throw error;
    } catch (e) { syncError = e; }
    await fetchLocal(`/testcases/${id}`, { method: 'PUT', body: JSON.stringify({ ...updatedTc, sync_state: syncError ? 'pending' : 'synced' }) });
    try {
      const all = JSON.parse(localStorage.getItem('qa_testcases') || '[]');
      const updated = all.map(tc => tc.id === id ? { ...tc, ...updatedTc } : tc);
      localStorage.setItem('qa_testcases', JSON.stringify(updated));
      return updated.find(tc => tc.id === id);
    } catch (e) { return updatedTc; }
  },

  async deleteTestCase(id) {
    const { error } = await supabase.from('test_cases').delete().eq('id', id);
    if (error) throw new Error(`Cloud deletion failed: ${error.message}`);
    await fetchLocal(`/testcases/${id}`, { method: 'DELETE' });
    const all = JSON.parse(localStorage.getItem('qa_testcases') || '[]');
    localStorage.setItem('qa_testcases', JSON.stringify(all.filter(tc => tc.id !== id)));
  }
};

// ─── AI SERVICE (CLOUD — Gemini key lives on Render) ─────────────────────────
export const AIService = {
  async translatePrompt(prompt) {
    try {
      return await fetchCloud('/translate', { method: 'POST', body: JSON.stringify({ prompt }) });
    } catch (e) {
      // Fallback to local if cloud unavailable
      return await fetchLocal('/translate', { method: 'POST', body: JSON.stringify({ prompt }) });
    }
  }
};

// ─── EXECUTION SERVICE (LOCAL — Playwright runs on desktop) ──────────────────
export const ExecutionService = {
  async triggerExecution(params) {
    const session = await AuthenticationService.getCurrentSession();
    if (!session?.user?.id) throw new Error('You must be signed in to run a test');
    const request = { ...params, user_id: session.user.id };
    const result = await fetchLocal('/execute', { method: 'POST', body: JSON.stringify(request) });
    const cloudRecord = {
      id: result.execution_id, project_id: params.project_id, test_id: params.test_id || null,
      user_id: session.user.id, status: 'Running', duration_ms: 0,
      browser: 'Chromium', headless: params.headless !== false, created_at: new Date().toISOString()
    };
    const { error } = await supabase.from('executions').upsert([cloudRecord]);
    if (error) console.warn('Execution will remain local until cloud sync succeeds:', error.message);
    return result;
  },
  async pollExecutionLogs(executionId) {
    try {
      const local = await fetchLocal(`/executions/${executionId}/logs`);
      if (local?.status !== 'Unknown' || (local?.logs || []).length) return local;
    } catch (e) {}
    const { data: execution, error: executionError } = await supabase.from('executions').select('*').eq('id', executionId).single();
    if (executionError) throw executionError;
    const { data: logs, error: logsError } = await supabase.from('execution_logs').select('*').eq('execution_id', executionId).order('step_number');
    if (logsError) throw logsError;
    const resolvedLogs = await Promise.all((logs || []).map(async log => {
      if (!log.screenshot_url?.startsWith('storage://')) return log;
      const path = log.screenshot_url.slice('storage://'.length);
      const { data } = await supabase.storage.from('execution-artifacts').createSignedUrl(path, 3600);
      return { ...log, screenshot_url: data?.signedUrl || null };
    }));
    return { execution_id: executionId, ...execution, logs: resolvedLogs };
  },
  async getExecutionHistory(projectId) {
    const result = new Map();
    const session = await AuthenticationService.getCurrentSession();
    if (!session?.user?.id) return [];
    try {
      const { data, error } = await supabase.from('executions').select('*').eq('project_id', projectId).eq('user_id', session.user.id).order('created_at', { ascending: false });
      if (!error) (data || []).forEach(item => result.set(item.id, item));
    } catch (e) {}
    try {
      const local = await fetchLocal(`/executions?project_id=${projectId}&user_id=${encodeURIComponent(session.user.id)}`);
      (local || []).forEach(item => result.set(item.id, { ...result.get(item.id), ...item }));
    } catch (e) {}
    return Array.from(result.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },
  async syncCompletedExecution(executionId, projectId, testId, result) {
    const session = await AuthenticationService.getCurrentSession();
    if (!session?.user?.id) return;
    const execution = {
      id: executionId, project_id: projectId, test_id: testId || null, user_id: session.user.id,
      status: result.status, duration_ms: result.duration_ms || 0, browser: 'Chromium',
      headless: true, error_message: result.error_message || null,
      created_at: result.created_at || new Date().toISOString()
    };
    const { error: executionError } = await supabase.from('executions').upsert([execution]);
    if (executionError) throw executionError;
    const logs = [];
    for (const sourceLog of (result.logs || [])) {
      const log = pickFields(sourceLog, ['id', 'execution_id', 'step_number', 'action', 'target', 'value',
        'raw_command', 'args', 'status', 'error_message', 'duration_ms', 'created_at']);
      log.screenshot_url = null;
      if (sourceLog.screenshot_url) {
        try {
          const response = await fetch(localAssetUrl(sourceLog.screenshot_url));
          if (!response.ok) throw new Error(`Screenshot HTTP ${response.status}`);
          const filename = sourceLog.screenshot_url.split('/').pop();
          const storagePath = `${session.user.id}/${executionId}/${filename}`;
          const { error } = await supabase.storage.from('execution-artifacts').upload(storagePath, await response.blob(), { upsert: true, contentType: 'image/png' });
          if (error) throw error;
          log.screenshot_url = `storage://${storagePath}`;
        } catch (error) { console.warn('Screenshot cloud sync failed:', error.message); }
      }
      logs.push(log);
    }
    if (logs.length) {
      const { error: logsError } = await supabase.from('execution_logs').upsert(logs);
      if (logsError) throw logsError;
    }
  },
  async stopExecution(executionId) {
    return await fetchLocal(`/executions/${executionId}/stop`, { method: 'POST' });
  }
};

// ─── ASSET SERVICE (LOCAL — files live on desktop) ───────────────────────────
export const AssetService = {
  async uploadVideo(file, projectId) {
    const formData = new FormData();
    formData.append('video', file);
    if (projectId) formData.append('project_id', projectId);
    const res = await fetch(`${LOCAL_FLASK_URL}/upload-video`, { method: 'POST', headers: LOCAL_API_TOKEN ? { 'X-QA-AI-Token': LOCAL_API_TOKEN } : {}, body: formData });
    if (!res.ok) throw new Error('Video upload failed');
    return await res.json();
  },

  async uploadAsset(file, projectId) {
    const formData = new FormData();
    formData.append('asset', file);
    if (projectId) formData.append('project_id', projectId);
    const res = await fetch(`${LOCAL_FLASK_URL}/upload-asset`, { method: 'POST', headers: LOCAL_API_TOKEN ? { 'X-QA-AI-Token': LOCAL_API_TOKEN } : {}, body: formData });
    if (!res.ok) throw new Error('Asset upload failed');
    return await res.json();
  },

  async getAssets(projectId) {
    try {
      return await fetchLocal(`/assets?project_id=${projectId}`);
    } catch (e) { return []; }
  },

  async deleteAsset(assetId) {
    await fetchLocal(`/assets/${assetId}`, { method: 'DELETE' });
  }
};

export function localAssetUrl(relativePath) {
  if (!relativePath) return '';
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  const base = `${LOCAL_FLASK_URL.replace(/\/api$/, '')}${relativePath}`;
  return LOCAL_API_TOKEN ? `${base}${base.includes('?') ? '&' : '?'}token=${encodeURIComponent(LOCAL_API_TOKEN)}` : base;
}

// ─── API CLIENT (Cloud Health Check) ─────────────────────────────────────────
export const ApiClient = {
  async checkCloudHealth() {
    try {
      const res = await fetch('https://qa-testing-application-new.onrender.com/api/health', {
        signal: AbortSignal.timeout(5000)
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }
};
