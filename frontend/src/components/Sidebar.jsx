import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, Briefcase, User, LogOut, Zap, ChevronRight } from 'lucide-react';
import { AuthenticationService } from '../services/api';

export default function Sidebar({ projects, selectedProject, setSelectedProject, onLogout }) {
  const [currentUser, setCurrentUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function getSessionUser() {
      const user = await AuthenticationService.getProfile();
      if (user) {
        setCurrentUser({
          email: user.email,
          user_metadata: { full_name: user.full_name }
        });
      }
    }
    getSessionUser();

    const handleProfileUpdate = () => getSessionUser();
    window.addEventListener('profile_updated', handleProfileUpdate);
    return () => window.removeEventListener('profile_updated', handleProfileUpdate);
  }, []);

  return (
    <aside className="w-60 surface flex flex-col h-full flex-shrink-0">
      {/* Brand */}
      <div className="px-5 h-16 flex items-center gap-3 border-b border-slate-100/50 dark:border-zinc-800/30">
        <div className="w-8 h-8 gradient-brand rounded-xl flex items-center justify-center shadow-md shadow-indigo-500/20 flex-shrink-0">
          <Zap size={16} className="text-white" />
        </div>
        <div>
          <span className="font-bold text-primary text-sm tracking-tight">QA·AI Platform</span>
          <p className="section-label leading-none mt-0.5">v2.0.0</p>
        </div>
      </div>

      {/* Project Switcher */}
      <div className="px-3 py-4">
        <p className="section-label px-2 mb-2">Workspace</p>
        <div className="relative">
          <select
            value={selectedProject?.id || ''}
            onChange={e => {
              const targetId = parseInt(e.target.value);
              const proj = projects.find(p => p.id === targetId);
              if (proj) {
                setSelectedProject(proj);
                navigate(`/projects/${proj.id}`);
              }
            }}
            className="w-full text-xs rounded-2xl px-3 py-3 focus:ring-2 focus:ring-indigo-500/20 outline-none cursor-pointer appearance-none pr-8 transition-colors
              bg-slate-100/70 text-slate-700
              dark:bg-[#161925] dark:text-zinc-300"
          >
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            {projects.length === 0 && <option value="">No projects</option>}
          </select>
          <ChevronRight size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary rotate-90 pointer-events-none" />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-4 scrollbar-thin">
        <NavSection label="General">
          <SidebarItem to="/dashboard"       icon={<LayoutDashboard size={15} />} label="Dashboard" />
          <SidebarItem to="/projects/create" icon={<PlusCircle size={15} />}      label="New Project" />
        </NavSection>

        {selectedProject && (
          <NavSection label="Active Workspace">
            <SidebarItem to={`/projects/${selectedProject.id}`} icon={<Briefcase size={15} />} label="Project Hub" />
          </NavSection>
        )}

        <NavSection label="Account">
          <SidebarItem to="/profile"  icon={<User size={15} />}     label="Profile" />
        </NavSection>
      </nav>

      {/* User Footer */}
      <div className="px-3 py-3 border-t border-slate-100/50 dark:border-zinc-800/30 flex-shrink-0">
        <div className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-slate-100 dark:hover:bg-[#161925] transition-colors group">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl gradient-brand flex items-center justify-center text-white font-bold text-xs flex-shrink-0 uppercase">
              {currentUser ? (currentUser.user_metadata?.full_name || currentUser.email || 'U').charAt(0) : 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-primary leading-none truncate">
                {currentUser ? (currentUser.user_metadata?.full_name || 'Workspace User') : 'Guest'}
              </p>
              <p className="text-[10px] text-secondary mt-0.5 truncate">
                {currentUser ? currentUser.email : 'guest@qa-platform.com'}
              </p>
            </div>
          </div>
          <button onClick={async () => {
            await AuthenticationService.logout();
            if (onLogout) onLogout();
            navigate('/login');
          }} className="text-muted hover:text-red-500 dark:hover:text-red-400 transition-colors p-1" title="Sign out">
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function NavSection({ label, children }) {
  return (
    <div className="space-y-1">
      <p className="section-label px-2 mb-1.5">{label}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function SidebarItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold transition-all duration-150 ${
          isActive ? 'nav-item-active' : 'nav-item-idle'
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}
