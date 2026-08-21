import { supabase } from '../supabaseClient';

// LOCAL Flask daemon (runs on user's desktop - handles execution, assets, test cases)
const LOCAL_FLASK_URL = 'http://127.0.0.1:5000/api';

// CLOUD API (Render - handles Gemini AI translation and OTP auth)
const CLOUD_API_URL = 'https://qa-testing-application-new.onrender.com/api';

// Helper: call LOCAL Flask daemon (Playwright, uploads, test cases)
async function fetchLocal(endpoint, options = {}) {
  const res = await fetch(`${LOCAL_FLASK_URL}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText}`);
  }
  return await res.json();
}

// Helper: call CLOUD API (Gemini, Brevo OTP)
async function fetchCloud(endpoint, options = {}) {
  const res = await fetch(`${CLOUD_API_URL}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
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

// ─── AUTH SERVICE ──────────────────────────────────────────────────────────────
export const AuthenticationService = {
  async login(email, password) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { success: true, session: data.session, user: data.user, isOffline: false };
    } catch (err) {
      console.warn('Supabase cloud login failed. Activating offline fallback session.', err);
      const fallbackSession = {
        access_token: 'offline_token_' + Date.now(),
        user: {
          id: 'user_1',
          user_id: 'user_1',
          email: email || 'gokulnath96880@gmail.com',
          user_metadata: { full_name: email?.split('@')[0] || 'User' }
        }
      };
      localStorage.setItem('qa_offline_session', JSON.stringify(fallbackSession));
      return { success: true, session: fallbackSession, user: fallbackSession.user, isOffline: true };
    }
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
      return { success: true, user: { id: 'user_1', email, user_metadata: { full_name: fullName } }, isOffline: true };
    }
  },

  async getCurrentSession() {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session) return data.session;
    } catch (e) {}
    const local = localStorage.getItem('qa_offline_session');
    return local ? JSON.parse(local) : null;
  },

  async logout() {
    try { await supabase.auth.signOut(); } catch (e) {}
    localStorage.removeItem('qa_offline_session');
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
    // Fallback to localStorage offline session
    try {
      const local = JSON.parse(localStorage.getItem('qa_offline_session') || 'null');
      if (local?.user) {
        return {
          id: local.user.id,
          email: local.user.email,
          full_name: local.user.user_metadata?.full_name || local.user.email?.split('@')[0] || 'Workspace User',
          user_metadata: local.user.user_metadata || {},
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

    // 1. Supabase Cloud DB first (Primary source of truth across all devices)
    try {
      const { data, error } = await supabase.from('projects').select('*');
      if (!error && Array.isArray(data)) {
        data.forEach(p => { if (p?.id) projectsMap.set(p.id, p); });
      }
    } catch (e) {}

    // 2. Local Flask daemon
    try {
      const localProjects = await fetchLocal('/projects');
      if (Array.isArray(localProjects)) {
        localProjects.forEach(p => { if (p?.id && !projectsMap.has(p.id)) projectsMap.set(p.id, p); });
      }
    } catch (e) {}

    // 3. localStorage fallback
    try {
      const lsProjects = JSON.parse(localStorage.getItem('qa_projects') || '[]');
      lsProjects.forEach(p => { if (p?.id && !projectsMap.has(p.id)) projectsMap.set(p.id, p); });
    } catch (e) {}

    const result = Array.from(projectsMap.values());
    localStorage.setItem('qa_projects', JSON.stringify(result));
    return result;
  },

  async createProject(projectData) {
    const session = await AuthenticationService.getCurrentSession();
    const userId = getNormalizedUserId(session);
    const projId = projectData.id || ('proj-' + Date.now());
    const fullProject = { ...projectData, id: projId, user_id: userId, created_at: new Date().toISOString() };

    // 1. Save to Supabase Cloud DB
    try {
      await supabase.from('projects').insert([fullProject]);
    } catch (e) {}

    // 2. Save to Local Flask daemon
    try {
      await fetchLocal('/projects', { method: 'POST', body: JSON.stringify(fullProject) });
    } catch (e) {}

    // 3. Save to localStorage
    try {
      const current = JSON.parse(localStorage.getItem('qa_projects') || '[]');
      current.unshift(fullProject);
      localStorage.setItem('qa_projects', JSON.stringify(current));
    } catch (e) {}

    return fullProject;
  },

  async updateProject(projectId, updates) {
    try { await supabase.from('projects').update(updates).eq('id', projectId); } catch (e) {}
    try { await fetchLocal(`/projects/${projectId}`, { method: 'PUT', body: JSON.stringify(updates) }); } catch (e) {}
    try {
      const current = JSON.parse(localStorage.getItem('qa_projects') || '[]');
      const updated = current.map(p => p.id === projectId ? { ...p, ...updates } : p);
      localStorage.setItem('qa_projects', JSON.stringify(updated));
      return updated.find(p => p.id === projectId);
    } catch (e) { return null; }
  },

  async deleteProject(projectId) {
    try { await supabase.from('projects').delete().eq('id', projectId); } catch (e) {}
    try { await fetchLocal(`/projects/${projectId}`, { method: 'DELETE' }); } catch (e) {}
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

    // 1. Supabase Cloud DB
    try {
      const { data, error } = await supabase.from('test_cases').select('*').eq('project_id', projectId);
      if (!error && Array.isArray(data)) {
        data.forEach(tc => { if (tc?.id) tcMap.set(tc.id, { ...tc, cached_json: sanitizeSteps(tc.cached_json) }); });
      }
    } catch (e) {}

    // 2. Local Flask daemon
    try {
      const localTc = await fetchLocal(`/testcases?project_id=${projectId}`);
      if (Array.isArray(localTc)) {
        localTc.forEach(tc => {
          if (tc?.id && !tcMap.has(tc.id)) {
            tcMap.set(tc.id, { ...tc, cached_json: sanitizeSteps(tc.cached_json) });
          }
        });
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
    const tcId = testCaseData.id || ('tc-' + Date.now());
    const fullTc = { ...testCaseData, id: tcId, cached_json: sanitizedJson, created_at: new Date().toISOString() };

    // 1. Supabase Cloud DB
    try { await supabase.from('test_cases').insert([fullTc]); } catch (e) {}

    // 2. Local Flask daemon
    try { await fetchLocal('/testcases', { method: 'POST', body: JSON.stringify(fullTc) }); } catch (e) {}

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

    try { await supabase.from('test_cases').update(updatedTc).eq('id', id); } catch (e) {}
    try { await fetchLocal(`/testcases/${id}`, { method: 'PUT', body: JSON.stringify(updatedTc) }); } catch (e) {}
    try {
      const all = JSON.parse(localStorage.getItem('qa_testcases') || '[]');
      const updated = all.map(tc => tc.id === id ? { ...tc, ...updatedTc } : tc);
      localStorage.setItem('qa_testcases', JSON.stringify(updated));
      return updated.find(tc => tc.id === id);
    } catch (e) { return updatedTc; }
  },

  async deleteTestCase(id) {
    try { await supabase.from('test_cases').delete().eq('id', id); } catch (e) {}
    try { await fetchLocal(`/testcases/${id}`, { method: 'DELETE' }); } catch (e) {}
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
    return await fetchLocal('/execute', { method: 'POST', body: JSON.stringify(params) });
  },
  async pollExecutionLogs(executionId) {
    return await fetchLocal(`/executions/${executionId}/logs`);
  },
  async getExecutionHistory(projectId) {
    try {
      return await fetchLocal(`/executions?project_id=${projectId}`);
    } catch (e) { return []; }
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
    const res = await fetch(`${LOCAL_FLASK_URL}/upload-video`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error('Video upload failed');
    return await res.json();
  },

  async uploadAsset(file, projectId) {
    const formData = new FormData();
    formData.append('asset', file);
    if (projectId) formData.append('project_id', projectId);
    const res = await fetch(`${LOCAL_FLASK_URL}/upload-asset`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error('Asset upload failed');
    return await res.json();
  },

  async getAssets(projectId) {
    try {
      return await fetchLocal(`/assets?project_id=${projectId}`);
    } catch (e) { return []; }
  },

  async deleteAsset(assetId) {
    try { await fetchLocal(`/assets/${assetId}`, { method: 'DELETE' }); } catch (e) {}
  }
};

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

