import { supabase } from '../supabaseClient';

const FLASK_BASE_URL = 'https://qa-testing-application-new.onrender.com/api';

// Helper for HTTP requests
async function fetchLocal(endpoint, options = {}) {
  try {
    const res = await fetch(`${FLASK_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }
    return await res.json();
  } catch (err) {
    console.warn(`Local Flask API fetch failed for ${endpoint}:`, err);
    throw err;
  }
}

// Normalized User Id extractor
export function getNormalizedUserId(session) {
  if (!session) return 'user_offline';
  return session.user?.id || session.user?.user_id || 'user_offline';
}

export const AuthenticationService = {
  async login(email, password) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { success: true, session: data.session, user: data.user };
    } catch (err) {
      console.warn('Supabase cloud login failed/unreachable. Activating offline fallback session.', err);
      const fallbackSession = {
        access_token: 'offline_token_' + Date.now(),
        user: {
          id: 'user_1',
          user_id: 'user_1',
          email: email || 'gokulnath96880@gmail.com',
          user_metadata: { full_name: 'Gokulnath' }
        }
      };
      localStorage.setItem('qa_offline_session', JSON.stringify(fallbackSession));
      return { success: true, session: fallbackSession, user: fallbackSession.user, isOffline: true };
    }
  },

  async register(email, password, fullName) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } }
      });
      if (error) throw error;
      return { success: true, user: data.user };
    } catch (err) {
      const fallbackUser = {
        id: 'user_1',
        email,
        user_metadata: { full_name: fullName }
      };
      return { success: true, user: fallbackUser, isOffline: true };
    }
  },

  async getCurrentSession() {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session) return data.session;
    } catch (e) {
      // ignore
    }
    const local = localStorage.getItem('qa_offline_session');
    return local ? JSON.parse(local) : null;
  },

  async logout() {
    try {
      await supabase.auth.signOut();
    } catch (e) {}
    localStorage.removeItem('qa_offline_session');
  },

  async sendOtp(email) {
    return await fetchLocal('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  },

  async verifyOtp(email, otp) {
    return await fetchLocal('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp })
    });
  },

  async resetPasswordWithOtp(email, otp, newPassword) {
    return await fetchLocal('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, otp, new_password: newPassword })
    });
  }
};

export const ProjectService = {
  async listProjects() {
    const projectsMap = new Map();

    // 1. Local Storage
    try {
      const lsProjects = JSON.parse(localStorage.getItem('qa_projects') || '[]');
      lsProjects.forEach(p => projectsMap.set(p.id, p));
    } catch (e) {}

    // 2. Local Flask Backend
    try {
      const localProjects = await fetchLocal('/projects');
      if (Array.isArray(localProjects)) {
        localProjects.forEach(p => projectsMap.set(p.id, p));
      }
    } catch (e) {}

    // 3. Supabase Cloud DB
    try {
      const { data, error } = await supabase.from('projects').select('*');
      if (!error && data) {
        data.forEach(p => projectsMap.set(p.id, p));
      }
    } catch (e) {}

    const result = Array.from(projectsMap.values());
    localStorage.setItem('qa_projects', JSON.stringify(result));
    return result;
  },

  async createProject(projectData) {
    let newProject = null;

    // 1. Post to Local Flask Backend
    try {
      newProject = await fetchLocal('/projects', {
        method: 'POST',
        body: JSON.stringify(projectData)
      });
    } catch (e) {
      newProject = {
        id: 'proj-' + Date.now(),
        ...projectData,
        created_at: new Date().toISOString()
      };
    }

    // 2. Sync to Supabase Cloud DB if available
    try {
      const session = await AuthenticationService.getCurrentSession();
      const userId = getNormalizedUserId(session);
      await supabase.from('projects').insert([{ ...newProject, user_id: userId }]);
    } catch (e) {}

    // 3. Update localStorage
    try {
      const current = JSON.parse(localStorage.getItem('qa_projects') || '[]');
      current.unshift(newProject);
      localStorage.setItem('qa_projects', JSON.stringify(current));
    } catch (e) {}

    return newProject;
  },

  async deleteProject(projectId) {
    try {
      await fetchLocal(`/projects/${projectId}`, { method: 'DELETE' });
    } catch (e) {}
    try {
      await supabase.from('projects').delete().eq('id', projectId);
    } catch (e) {}

    const current = JSON.parse(localStorage.getItem('qa_projects') || '[]');
    const updated = current.filter(p => p.id !== projectId);
    localStorage.setItem('qa_projects', JSON.stringify(updated));
  }
};

export const TestCaseService = {
  async getTestCases(projectId) {
    try {
      return await fetchLocal(`/testcases?project_id=${projectId}`);
    } catch (e) {
      return [];
    }
  },

  async createTestCase(testCaseData) {
    return await fetchLocal('/testcases', {
      method: 'POST',
      body: JSON.stringify(testCaseData)
    });
  },

  async updateTestCase(id, testCaseData) {
    return await fetchLocal(`/testcases/${id}`, {
      method: 'PUT',
      body: JSON.stringify(testCaseData)
    });
  }
};

export const AIService = {
  async translatePrompt(prompt) {
    return await fetchLocal('/translate', {
      method: 'POST',
      body: JSON.stringify({ prompt })
    });
  }
};

export const ExecutionService = {
  async triggerExecution(params) {
    return await fetchLocal('/execute', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async pollExecutionLogs(executionId) {
    return await fetchLocal(`/executions/${executionId}/logs`);
  }
};

export const AssetService = {
  async uploadVideo(file) {
    const formData = new FormData();
    formData.append('video', file);

    const res = await fetch(`${FLASK_BASE_URL}/upload-video`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error('Video upload failed');
    return await res.json();
  }
};
