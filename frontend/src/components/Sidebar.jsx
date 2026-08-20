import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, PlusCircle, FolderGit2, User, LogOut, 
  ChevronDown, Zap 
} from 'lucide-react';
import { AuthenticationService } from '../services/api';

export default function Sidebar({ projects = [], selectedProject, onSelectProject, session }) {
  const navigate = useNavigate();

  const user = session?.user;
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Gokulnath';
  const userEmail = user?.email || 'gokulnath96880@gmail.com';
  const initialLetter = (userName || 'G').charAt(0).toUpperCase();

  const handleLogout = async () => {
    await AuthenticationService.logout();
    window.location.reload();
  };

  return (
    <aside className="w-64 border-r border-dark-border bg-[#0B0F17] flex flex-col h-screen select-none shrink-0">
      {/* Brand Header */}
      <div className="p-5 border-b border-dark-border flex items-center space-x-3">
        <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30 shrink-0">
          <Zap className="w-4 h-4 fill-white" />
        </div>
        <div>
          <h1 className="font-bold text-white tracking-wide text-sm leading-none">
            QA·AI Platform
          </h1>
          <span className="text-[10px] text-slate-500 font-mono">v1.0.0</span>
        </div>
      </div>

      {/* Workspace Project Selector Dropdown */}
      <div className="p-4 border-b border-dark-border space-y-1.5">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
          WORKSPACE
        </label>
        <div className="relative">
          <select
            value={selectedProject?.id || ''}
            onChange={(e) => {
              const proj = projects.find(p => p.id === e.target.value);
              if (proj) {
                onSelectProject(proj);
                navigate(`/projects/${proj.id}`);
              }
            }}
            className="w-full bg-[#131926] border border-dark-border text-slate-200 text-xs rounded-xl px-3 py-2.5 appearance-none focus:outline-none focus:border-indigo-500 transition-colors font-medium cursor-pointer truncate pr-8"
          >
            {projects.length === 0 && <option value="">No Projects Found</option>}
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3 pointer-events-none" />
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 p-4 space-y-5 overflow-y-auto">
        {/* GENERAL Section */}
        <div className="space-y-1">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 mb-1.5">
            GENERAL
          </div>
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-dark-card/60'
              }`
            }
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            <span>Dashboard</span>
          </NavLink>

          <NavLink
            to="/projects/new"
            className={({ isActive }) =>
              `flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-dark-card/60'
              }`
            }
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            <span>New Project</span>
          </NavLink>
        </div>

        {/* ACTIVE WORKSPACE Section */}
        {selectedProject && (
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 mb-1.5">
              ACTIVE WORKSPACE
            </div>
            <NavLink
              to={`/projects/${selectedProject.id}`}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-dark-card/60'
                }`
              }
            >
              <FolderGit2 className="w-4 h-4 shrink-0" />
              <span className="truncate">Project Hub</span>
            </NavLink>
          </div>
        )}

        {/* ACCOUNT Section */}
        <div className="space-y-1">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 mb-1.5">
            ACCOUNT
          </div>
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-dark-card/60'
              }`
            }
          >
            <User className="w-4 h-4 shrink-0" />
            <span>Profile</span>
          </NavLink>
        </div>
      </nav>

      {/* User Card Footer */}
      <div className="p-4 border-t border-dark-border">
        <div className="flex items-center justify-between p-2 rounded-xl bg-dark-card/50 border border-dark-border">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
              {initialLetter}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">{userName}</p>
              <p className="text-[10px] text-slate-400 font-mono truncate">{userEmail}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors shrink-0"
            title="Sign Out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
