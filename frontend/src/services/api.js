import { supabase } from '../supabaseClient';
import { requestJson } from '../lib/http';
import { createDesktopCloud } from '../lib/desktop-cloud';

// LOCAL Flask daemon (runs on user's desktop - handles execution, assets, test cases)
const desktopConfig = window.qaDesktop || {};
const LOCAL_FLASK_URL = desktopConfig.localApiUrl || import.meta.env.VITE_LOCAL_ENGINE_URL || 'http://127.0.0.1:5000/api';
const LOCAL_API_TOKEN = desktopConfig.localApiToken || '';

// CLOUD API (Render - handles Gemini AI translation and OTP auth)
const CLOUD_API_URL = desktopConfig.cloudApiUrl || import.meta.env.VITE_CLOUD_API_URL || 'https://qa-testing-application-new.onrender.com/api';

// Helper: call LOCAL Flask daemon (Playwright, uploads, test cases)
async function fetchLocal(endpoint, options = {}) {
  return requestJson(`${LOCAL_FLASK_URL}${endpoint}`, options, {
    'Content-Type': 'application/json', ...(LOCAL_API_TOKEN ? { 'X-QA-AI-Token': LOCAL_API_TOKEN } : {})
  });
}

// Helper: call CLOUD API (Gemini, Brevo OTP)
async function fetchCloud(endpoint, options = {}) {
  return requestJson(`${CLOUD_API_URL}${endpoint}`, options, { 'Content-Type': 'application/json' });
}

async function fetchCloudAsUser(endpoint, session, options = {}) {
  return requestJson(CLOUD_API_URL + endpoint, options, {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + session.access_token
  });
}

// Normalized User Id extractor
export function getNormalizedUserId(session) {
  if (!session) return 'user_offline';
  return session.user?.id || session.user?.user_id || 'user_offline';
}

function pickFields(value, fields) {
  return Object.fromEntries(fields.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
}
const PROJECT_CLOUD_FIELDS = ['id', 'user_id', 'name', 'app_name', 'app_url', 'description', 'face_auth_enabled', 'face_video_storage_path', 'created_at', 'updated_at'];
const TESTCASE_CLOUD_FIELDS = ['id', 'project_id', 'user_id', 'name', 'type', 'commands', 'cached_json', 'status', 'created_at', 'updated_at'];

async function localDesktopProject(projectId) {
  const session = await AuthenticationService.getCurrentSession();
  if (!session?.user?.id) throw new Error('Sign in before changing a project');
  // Resolve the authoritative local type before deciding where a mutation goes.
  // If the engine is unavailable, fail closed rather than accidentally syncing
  // or deleting a local desktop project through the web-project path.
  const projects = await fetchLocal(`/projects?user_id=${encodeURIComponent(session.user.id)}`);
  return projects.find(p => p.id === projectId && p.project_type === 'desktop');
}

function cacheProject(record) {
  try {
    const current = JSON.parse(localStorage.getItem('qa_projects') || '[]');
    localStorage.setItem('qa_projects', JSON.stringify([record, ...current.filter(p => p.id !== record.id)]));
  } catch (_) { /* SQLite remains authoritative when the browser cache is full. */ }
}

async function ensureLocalWebProject(projectId) {
  const session = await AuthenticationService.getCurrentSession();
  if (!session?.user?.id) throw new Error('Sign in before using project files');
  const userId = session.user.id;
  const local = await fetchLocal(`/projects?user_id=${encodeURIComponent(userId)}`);
  const existing = Array.isArray(local) ? local.find(item => item.id === projectId) : null;
  if (existing) return existing;
  const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`Cloud project lookup failed: ${error.message}`);
  if (!data) throw new Error('This project is not available for the signed-in account');
  return fetchLocal('/projects', {
    method: 'POST',
    body: JSON.stringify({ ...pickFields(data, PROJECT_CLOUD_FIELDS), project_type: 'web', sync_state: 'synced' })
  });
}
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
  },

  async updateProfile(fullName) {
    const cleanName = String(fullName || '').trim();
    if (cleanName.length < 2 || cleanName.length > 100) throw new Error('Name must contain between 2 and 100 characters');
    const { data, error } = await supabase.auth.updateUser({ data: { full_name: cleanName } });
    if (error) throw new Error(error.message || 'Profile update failed');
    const profile = {
      id: data.user.id, email: data.user.email, full_name: cleanName,
      user_metadata: { ...(data.user.user_metadata || {}), full_name: cleanName }
    };
    localStorage.setItem('user', JSON.stringify(profile));
    return profile;
  }
};

// ─── PROJECT SERVICE ──────────────────────────────────────────────────────────
export const ProjectService = {
  ensureLocalProject: ensureLocalWebProject,
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

    // Desktop workspaces have an owner-protected table separate from legacy web clients.
    try {
      const desktops=await DesktopCloudService.list();
      for(const row of desktops) projectsMap.set(row.id,{...row.payload.project,user_id:userId,project_type:'desktop',cloud_connected:true,cloud_only:true,sync_state:'synced'});
    } catch (_) { /* Existing local projects remain usable while cloud service is unavailable. */ }

    // 2. Local Flask daemon
    try {
      const localProjects = await fetchLocal(`/projects?user_id=${encodeURIComponent(userId)}`);
      if (Array.isArray(localProjects)) {
        for (const p of localProjects) {
          if (p?.sync_state === 'pending' && p.project_type !== 'desktop') {
            try {
              const { error } = await supabase.from('projects').upsert([pickFields(p, PROJECT_CLOUD_FIELDS)]);
              if (!error) {
                p.sync_state = 'synced'; delete p.sync_error;
                await fetchLocal(`/projects/${p.id}`, { method: 'PUT', body: JSON.stringify({ sync_state: 'synced' }) });
              }
            } catch (e) {}
          }
          if (p?.id) {
            const cloudProject = projectsMap.get(p.id);
            projectsMap.set(p.id, p.project_type === 'desktop' ? {...p,cloud_only:false,cloud_connected:Boolean(p.cloud_connected || cloudProject)} : cloudProject ? {
              ...cloudProject,
              ...(p.video_file_path ? { video_file_path: p.video_file_path } : {}),
              ...(p.sync_state ? { sync_state: p.sync_state } : {})
            } : p);
          }
        }
      }
    } catch (e) {}

    // 3. localStorage fallback
    try {
      const lsProjects = JSON.parse(localStorage.getItem('qa_projects') || '[]');
      lsProjects.filter(p => p.user_id === userId).forEach(p => {
        if (!p?.id) return;
        const current = projectsMap.get(p.id);
        projectsMap.set(p.id, current ? {
          ...current,
          ...(p.video_file_path ? { video_file_path: p.video_file_path } : {})
        } : p);
      });
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
    if (projectData.project_type === 'desktop') {
      // Cloud synchronization is not enabled merely because schema 002 exists.
      const saved = await fetchLocal('/projects', { method: 'POST', body: JSON.stringify({ ...fullProject, sync_state: 'local_only' }) });
      cacheProject(saved);
      return saved;
    }

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
    const desktop=await localDesktopProject(projectId);
    if (desktop) {
      const saved = await fetchLocal(`/projects/${projectId}`, { method: 'PUT', body: JSON.stringify({ ...updates, sync_state: desktop.cloud_connected ? 'pending' : 'local_only' }) });
      cacheProject(saved);
      return saved;
    }
    let syncError = null;
    const cloudUpdates = pickFields({ ...updates, updated_at: new Date().toISOString() }, PROJECT_CLOUD_FIELDS);
    try {
      const { error } = await supabase.from('projects').update(cloudUpdates).eq('id', projectId);
      if (error) throw error;
    } catch (e) { syncError = e; }
    await ensureLocalWebProject(projectId);
    await fetchLocal(`/projects/${projectId}`, { method: 'PUT', body: JSON.stringify({ ...updates, sync_state: syncError ? 'pending' : 'synced' }) });
    try {
      const current = JSON.parse(localStorage.getItem('qa_projects') || '[]');
      const updated = current.map(p => p.id === projectId ? { ...p, ...updates } : p);
      localStorage.setItem('qa_projects', JSON.stringify(updated));
      return { ...updated.find(p => p.id === projectId), sync_state: syncError ? 'pending' : 'synced', sync_error: syncError?.message };
    } catch (e) { return null; }
  },

  async deleteProject(projectId) {
    const desktop=await localDesktopProject(projectId);
    if (desktop) {
      if(desktop.cloud_connected) await DesktopCloudService.remove(projectId);
      await fetchLocal(`/projects/${projectId}`, { method: 'DELETE' });
      const current = JSON.parse(localStorage.getItem('qa_projects') || '[]');
      localStorage.setItem('qa_projects', JSON.stringify(current.filter(p => p.id !== projectId)));
      return;
    }
    const session = await AuthenticationService.getCurrentSession();
    if (session?.user?.id) {
      const folder = `${session.user.id}/${projectId}`;
      const { data: objects } = await supabase.storage.from('face-videos').list(folder);
      if (objects?.length) {
        await supabase.storage.from('face-videos').remove(objects.map(item => `${folder}/${item.name}`));
      }
      const { data: assetRows } = await supabase.from('project_assets').select('storage_path').eq('project_id', projectId).eq('user_id', session.user.id);
      const assetPaths = (assetRows || []).map(row => row.storage_path).filter(Boolean);
      if (assetPaths.length) await supabase.storage.from('project-assets').remove(assetPaths);
    }
    const { error } = await supabase.from('projects').delete().eq('id', projectId);
    if (error) throw new Error(`Cloud deletion failed: ${error.message}`);
    await fetchLocal(`/projects/${projectId}`, { method: 'DELETE' });
    const current = JSON.parse(localStorage.getItem('qa_projects') || '[]');
    localStorage.setItem('qa_projects', JSON.stringify(current.filter(p => p.id !== projectId)));
  }
};

export const DesktopService = {
  listSuites: id => fetchLocal(`/desktop/projects/${encodeURIComponent(id)}/suites`),
  saveNamedSuite: (id, suiteId, name, test_ids, continue_on_failure) => fetchLocal(`/desktop/projects/${encodeURIComponent(id)}/suites${suiteId ? '/' + encodeURIComponent(suiteId) : ''}`, {method:suiteId ? 'PUT' : 'POST', body:JSON.stringify({name,test_ids,continue_on_failure})}),
  deleteSuite: (id, suiteId) => fetchLocal(`/desktop/projects/${encodeURIComponent(id)}/suites/${encodeURIComponent(suiteId)}`, {method:'DELETE'}),
  loadSuite: id => fetchLocal(`/desktop/projects/${encodeURIComponent(id)}/suite`),
  saveSuite: (id, test_ids, continue_on_failure) => fetchLocal(`/desktop/projects/${encodeURIComponent(id)}/suite`, {method:'PUT', body:JSON.stringify({test_ids,continue_on_failure})}),
  listTests: id => fetchLocal(`/desktop/projects/${encodeURIComponent(id)}/tests`),
  saveNamedTest: (id, testId, name, steps) => fetchLocal(`/desktop/projects/${encodeURIComponent(id)}/tests${testId ? '/' + encodeURIComponent(testId) : ''}`, {method: testId ? 'PUT' : 'POST', body: JSON.stringify({name, steps})}),
  deleteTest: (id, testId) => fetchLocal(`/desktop/projects/${encodeURIComponent(id)}/tests/${encodeURIComponent(testId)}`, {method: 'DELETE'}),
  loadTest: id => fetchLocal(`/desktop/projects/${encodeURIComponent(id)}/test`),
  saveTest: (id, steps) => fetchLocal(`/desktop/projects/${encodeURIComponent(id)}/test`, { method: 'PUT', body: JSON.stringify({ steps }) }),
  history: id => fetchLocal(`/desktop/projects/${encodeURIComponent(id)}/history`),
  createJob: data => fetchLocal('/desktop/jobs', { method: 'POST', body: JSON.stringify(data) }),
  getJob: id => fetchLocal(`/desktop/jobs/${id}`),
  stop: id => fetchLocal(`/desktop/jobs/${id}/stop`, { method: 'POST' }),
};

// Helper: clean step targets (strip action prefixes like "verify_text ")
function sanitizeSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.map(s => s && typeof s === 'object' ? { ...s, target: strVal(s.target) } : s);
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
    await AIService.validateSteps(sanitizedJson);
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
    await AIService.validateSteps(sanitizedJson);
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

// Local contract first; optional cloud AI never bypasses local validation.
export const AIService = {
  async translatePrompt(prompt) {
    // The versioned local contract is authoritative. A stale cloud parser must
    // not silently replace it when a test needs clarification.
    try {
      return await fetchLocal('/translate', { method: 'POST', body: JSON.stringify({ prompt }) });
    } catch (error) {
      if (!error.details?.needs_ai) throw error;
      if (!window.confirm('Some instructions need clarification. Send this test text to the configured cloud AI for suggested steps? Avoid including real passwords; use test-data variables.')) throw error;
      const candidate = await fetchCloud('/translate', { method: 'POST', body: JSON.stringify({ prompt }) });
      if (candidate.contract_version !== 2) throw new Error('Cloud conversion uses an older contract. Update the cloud service before using AI suggestions, or use documented actions locally.');
      return await fetchLocal('/validate-translation', { method: 'POST', body: JSON.stringify({ prompt, steps: candidate.steps }) });
    }
  },
  async validateSteps(steps) {
    return await fetchLocal('/validate', { method: 'POST', body: JSON.stringify({ steps }) });
  },
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
    const { data: telemetry } = await supabase.from('telemetry_spans').select('*').eq('execution_id', executionId).order('created_at');
    const resolvedLogs = await Promise.all((logs || []).map(async log => {
      if (!log.screenshot_url?.startsWith('storage://')) return log;
      const path = log.screenshot_url.slice('storage://'.length);
      const { data } = await supabase.storage.from('execution-artifacts').createSignedUrl(path, 3600);
      return { ...log, screenshot_url: data?.signedUrl || null };
    }));
    return { execution_id: executionId, ...execution, logs: resolvedLogs, telemetry: telemetry || [] };
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
    const telemetry = (result.telemetry || []).map(span => pickFields(span, [
      'id', 'execution_id', 'trace_id', 'span_id', 'parent_span_id', 'service_name',
      'name', 'status_code', 'duration_ms', 'attributes', 'created_at'
    ]));
    if (telemetry.length) {
      const { error: telemetryError } = await supabase.from('telemetry_spans').upsert(telemetry);
      if (telemetryError) throw telemetryError;
    }
  },
  async stopExecution(executionId) {
    return await fetchLocal(`/executions/${executionId}/stop`, { method: 'POST' });
  }
};

// ─── ASSET SERVICE (LOCAL — files live on desktop) ───────────────────────────
export const AssetService = {
  async uploadVideo(file, projectId) {
    if (projectId) await ensureLocalWebProject(projectId);
    const formData = new FormData();
    formData.append('video', file);
    if (projectId) formData.append('project_id', projectId);
    const res = await fetch(`${LOCAL_FLASK_URL}/upload-video`, { method: 'POST', headers: LOCAL_API_TOKEN ? { 'X-QA-AI-Token': LOCAL_API_TOKEN } : {}, body: formData });
    if (!res.ok) throw new Error('Video upload failed');
    return await res.json();
  },

  async uploadFaceVideo(file, projectId) {
    const session = await AuthenticationService.getCurrentSession();
    if (!session?.user?.id) throw new Error('You must be signed in to upload a face video');
    const fileName = file?.name?.toLowerCase() || '';
    if (!file || (file.type !== 'video/mp4' && !fileName.endsWith('.mp4'))) {
      throw new Error('Face video must be an MP4 file');
    }

    const localResult = await this.uploadVideo(file, projectId);
    const storagePath = `${session.user.id}/${projectId}/face-video.mp4`;
    const { error } = await supabase.storage.from('face-videos').upload(storagePath, file, {
      upsert: true,
      contentType: 'video/mp4',
      cacheControl: '3600'
    });
    if (error) throw new Error(`Cloud face-video upload failed: ${error.message}`);
    return { ...localResult, storage_path: storagePath };
  },

  async restoreFaceVideo(storagePath, projectId) {
    if (!storagePath) throw new Error('Face-video storage path is missing');
    const { data, error } = await supabase.storage.from('face-videos').download(storagePath);
    if (error) throw new Error(`Cloud face-video download failed: ${error.message}`);
    const file = new File([data], 'face-video.mp4', { type: 'video/mp4' });
    return await this.uploadVideo(file, projectId);
  },

  async uploadAssetLocal(file, projectId, assetId = '') {
    if (projectId) await ensureLocalWebProject(projectId);
    const formData = new FormData();
    formData.append('asset', file);
    if (projectId) formData.append('project_id', projectId);
    if (assetId) formData.append('asset_id', assetId);
    const res = await fetch(`${LOCAL_FLASK_URL}/upload-asset`, { method: 'POST', headers: LOCAL_API_TOKEN ? { 'X-QA-AI-Token': LOCAL_API_TOKEN } : {}, body: formData });
    if (!res.ok) throw new Error(`Local asset save failed: ${await res.text()}`);
    return await res.json();
  },

  async uploadAsset(file, projectId) {
    const session = await AuthenticationService.getCurrentSession();
    if (!session?.user?.id) throw new Error('You must be signed in to upload an asset');
    const assetId = crypto.randomUUID();
    const local = await this.uploadAssetLocal(file, projectId, assetId);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${session.user.id}/${projectId}/${assetId}/${safeName}`;
    const { error: uploadError } = await supabase.storage.from('project-assets').upload(storagePath, file, {
      upsert: true, contentType: file.type || 'application/octet-stream'
    });
    if (uploadError) throw new Error(`Cloud asset upload failed: ${uploadError.message}`);
    const metadata = {
      id: assetId, project_id: projectId, user_id: session.user.id, filename: file.name,
      storage_path: storagePath, size_bytes: file.size || 0,
      content_type: file.type || 'application/octet-stream', created_at: local.created_at || new Date().toISOString()
    };
    try {
      await fetchCloudAsUser('/cloud/project-assets', session, { method: 'POST', body: JSON.stringify(metadata) });
    } catch (error) {
      await supabase.storage.from('project-assets').remove([storagePath]);
      throw new Error('Cloud asset metadata save failed: ' + error.message);
    }
    return { ...local, ...metadata };
  },

  async getAssets(projectId) {
    const merged = new Map();
    try {
      const local = await fetchLocal(`/assets?project_id=${projectId}`);
      (local || []).forEach(asset => merged.set(asset.id, asset));
    } catch (e) {}
    const session = await AuthenticationService.getCurrentSession();
    if (!session?.user?.id) return Array.from(merged.values());
    try {
      const data = await fetchCloudAsUser('/cloud/project-assets?project_id=' + encodeURIComponent(projectId), session);
      (data || []).forEach(asset => merged.set(asset.id, { ...asset, ...merged.get(asset.id) }));
    } catch (_) { /* Local assets remain available if cloud metadata is temporarily unavailable. */ }
    return Array.from(merged.values());
  },

  async prepareAssetsForExecution(projectId) {
    const assets = await this.getAssets(projectId);
    for (const asset of assets) {
      if (asset.stored_path && asset.available_locally !== false) continue;
      if (!asset.storage_path) continue;
      const { data, error } = await supabase.storage.from('project-assets').download(asset.storage_path);
      if (error) throw new Error(`Could not restore project asset '${asset.filename}': ${error.message}`);
      const file = new File([data], asset.filename, { type: asset.content_type || 'application/octet-stream' });
      await this.uploadAssetLocal(file, projectId, asset.id);
    }
    return await this.getAssets(projectId);
  },

  async deleteAsset(assetId) {
    const session = await AuthenticationService.getCurrentSession();
    if (session?.user?.id) {
      const { data } = await supabase.from('project_assets').select('storage_path').eq('id', assetId).eq('user_id', session.user.id).maybeSingle();
      if (data?.storage_path) await supabase.storage.from('project-assets').remove([data.storage_path]);
      await supabase.from('project_assets').delete().eq('id', assetId).eq('user_id', session.user.id);
    }
    try { await fetchLocal(`/assets/${assetId}`, { method: 'DELETE' }); } catch (e) {}
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
      const res = await fetch(`${CLOUD_API_URL}/health`, {
        signal: AbortSignal.timeout(5000)
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }
};

export const DesktopCloudService = createDesktopCloud({local:fetchLocal,supabase,getSession:()=>AuthenticationService.getCurrentSession()});

export const VaultService = {
  async request(id, options, name) {
    const session=await AuthenticationService.getCurrentSession();
    if(!session?.user?.id) throw new Error('Sign in to manage test credentials');
    return fetchLocal(`/projects/${encodeURIComponent(id)}/vault${name ? '/'+encodeURIComponent(name) : ''}?user_id=${encodeURIComponent(session.user.id)}`,options);
  },
  list(id){return this.request(id);},
  save(id,name,value){return this.request(id,{method:'PUT',body:JSON.stringify({name,value})});},
  remove(id,name){return this.request(id,{method:'DELETE'},name);}
};

export const RecordingService={
  async start(project_id,url){const session=await AuthenticationService.getCurrentSession();if(!session?.user?.id)throw new Error('Sign in before recording');return fetchLocal('/recordings',{method:'POST',body:JSON.stringify({project_id,url,user_id:session.user.id,confirmed:true})});},
  async request(id,stop=false){const session=await AuthenticationService.getCurrentSession();if(!session?.user?.id)throw new Error('Sign in to manage your recording');return fetchLocal(`/recordings/${encodeURIComponent(id)}${stop?'/stop':''}?user_id=${encodeURIComponent(session.user.id)}`,stop?{method:'POST'}:undefined);},
  get(id){return this.request(id);},stop(id){return this.request(id,true);}
};

export const VideoDraftService={
  async create(project,file){
    const session=await AuthenticationService.getCurrentSession();if(!session?.access_token)throw new Error('Sign in before analyzing a recording');
    if(file.size>100*1024*1024)throw new Error('Choose a test recording no larger than 100 MB');
    const body=new FormData();body.append('video',file);body.append('consent','true');body.append('project_type',project.project_type||'web');body.append('url',project.app_url||'');body.append('application_name',project.app_name||project.name||'');
    return requestJson(`${CLOUD_API_URL}/video-drafts`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`},body,timeoutMs:300000});
  }
};
