import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import Dashboard from './pages/dashboard/Dashboard';
import CreateProject from './pages/projects/CreateProject';
import ProjectDetails from './pages/projects/ProjectDetails';
import Profile from './pages/auth/Profile';
import Settings from './pages/settings/Settings';

import { AuthenticationService, ProjectService } from './services/api';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);

  // Initialize session
  useEffect(() => {
    AuthenticationService.getCurrentSession().then((sess) => {
      setSession(sess);
      setLoading(false);
    });
  }, []);

  // Fetch Projects list
  useEffect(() => {
    if (session) {
      ProjectService.listProjects().then((list) => {
        setProjects(list);
        if (list.length > 0 && !selectedProject) {
          setSelectedProject(list[0]);
        }
      });
    }
  }, [session]);

  // 20-Minute Inactivity Auto-Logout Watcher
  useEffect(() => {
    if (!session) return;

    const INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes
    const THROTTLE_MS = 10 * 1000; // 10 seconds

    let lastWriteTime = Date.now();

    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastWriteTime > THROTTLE_MS) {
        localStorage.setItem('last_active_timestamp', now.toString());
        lastWriteTime = now;
      }
    };

    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('click', handleUserActivity);
    window.addEventListener('scroll', handleUserActivity);

    const checkInactivityInterval = setInterval(() => {
      const lastActive = parseInt(localStorage.getItem('last_active_timestamp') || Date.now().toString(), 10);
      if (Date.now() - lastActive >= INACTIVITY_TIMEOUT_MS) {
        console.warn('20 minutes of user inactivity detected. Auto logging out user.');
        AuthenticationService.logout();
        setSession(null);
      }
    }, 15000);

    return () => {
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('click', handleUserActivity);
      window.removeEventListener('scroll', handleUserActivity);
      clearInterval(checkInactivityInterval);
    };
  }, [session]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0F17] flex items-center justify-center text-slate-400 font-mono text-xs select-none">
        Initializing QA-AI Autonomous Testing Platform...
      </div>
    );
  }

  return (
    <HashRouter>
      <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex overflow-hidden select-none">
        {session && (
          <Sidebar
            projects={projects}
            selectedProject={selectedProject}
            onSelectProject={(proj) => setSelectedProject(proj)}
            session={session}
          />
        )}

        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          {session && (
            <Header
              user={session.user}
              projects={projects}
              selectedProject={selectedProject}
            />
          )}

          <main className="flex-1 bg-[#0B0F17] overflow-y-auto min-h-0">
            <Routes>
              {/* Public Auth Routes */}
              <Route path="/login" element={<Login setSession={setSession} />} />
              <Route path="/register" element={<Register setSession={setSession} />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />

              {/* Protected App Routes */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute session={session}>
                    <Dashboard
                      projects={projects}
                      onSelectProject={(p) => setSelectedProject(p)}
                      onDeleteProject={(id) => {
                        const updated = projects.filter(p => p.id !== id);
                        setProjects(updated);
                        if (updated.length > 0) setSelectedProject(updated[0]);
                      }}
                    />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/projects/new"
                element={
                  <ProtectedRoute session={session}>
                    <CreateProject
                      onProjectCreated={(newProj) => {
                        setProjects([newProj, ...projects]);
                        setSelectedProject(newProj);
                      }}
                    />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/projects/:id"
                element={
                  <ProtectedRoute session={session}>
                    <ProjectDetails
                      projects={projects}
                      onDeleteProject={(deletedId) => {
                        const updated = projects.filter(p => p.id !== deletedId);
                        setProjects(updated);
                        if (updated.length > 0) setSelectedProject(updated[0]);
                      }}
                    />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/profile"
                element={
                  <ProtectedRoute session={session}>
                    <Profile session={session} setSession={setSession} />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/settings"
                element={
                  <ProtectedRoute session={session}>
                    <Settings />
                  </ProtectedRoute>
                }
              />

              {/* Fallback route */}
              <Route
                path="*"
                element={<Navigate to={session ? "/dashboard" : "/login"} replace />}
              />
            </Routes>
          </main>
        </div>
      </div>
    </HashRouter>
  );
}
