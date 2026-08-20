import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FolderGit2, PlusCircle, Camera, ShieldCheck, ChevronDown, Sparkles } from 'lucide-react';

export default function Sidebar({ projects = [], selectedProject, onSelectProject }) {
  const navigate = useNavigate();

  return (
    <aside className="w-64 border-r border-dark-border bg-[#0B0F17] flex flex-col h-[calc(100vh-4rem)] select-none">
      {/* Workspace Project Selector Dropdown */}
      <div className="p-4 border-b border-dark-border">
        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
          Active Workspace
        </label>
        <div className="relative">
          <select
            value={selectedProject?.id || ''}
            onChange={(e) => {
              const proj = projects.find(p => p.id === e.target.value);
              if (proj) onSelectProject(proj);
            }}
            className="w-full bg-[#131926] border border-dark-border text-slate-200 text-xs rounded-xl px-3 py-2.5 appearance-none focus:outline-none focus:border-indigo-500 transition-colors font-medium cursor-pointer"
          >
            {projects.length === 0 && <option value="">No Projects Found</option>}
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} {p.face_auth_enabled ? '📷' : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2">
          Main Menu
        </div>

        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
              isActive
                ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-dark-card/60'
            }`
          }
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Dashboard Overview</span>
        </NavLink>

        {selectedProject && (
          <NavLink
            to={`/projects/${selectedProject.id}`}
            className={({ isActive }) =>
              `flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-dark-card/60'
              }`
            }
          >
            <FolderGit2 className="w-4 h-4" />
            <span className="truncate">Project Details</span>
          </NavLink>
        )}

        <NavLink
          to="/projects/new"
          className={({ isActive }) =>
            `flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
              isActive
                ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-dark-card/60'
            }`
          }
        >
          <PlusCircle className="w-4 h-4 text-emerald-400" />
          <span>Create New Project</span>
        </NavLink>

        <div className="pt-4 text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2">
          Capabilities & Engines
        </div>

        <div className="px-3 py-2 rounded-xl bg-dark-card/40 border border-dark-border text-xs space-y-2">
          <div className="flex items-center justify-between text-slate-300">
            <span className="flex items-center gap-1.5"><Camera className="w-3.5 h-3.5 text-indigo-400" /> Biometric Y4M</span>
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-mono">READY</span>
          </div>
          <div className="flex items-center justify-between text-slate-300">
            <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-amber-400" /> Gemini AI Parser</span>
            <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded font-mono">ACTIVE</span>
          </div>
          <div className="flex items-center justify-between text-slate-300">
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-cyan-400" /> Playwright Driver</span>
            <span className="text-[10px] text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded font-mono">SYNC</span>
          </div>
        </div>
      </nav>

      {/* Quick Launch CTA */}
      <div className="p-4 border-t border-dark-border">
        <button
          onClick={() => navigate('/projects/new')}
          className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium text-xs hover:from-indigo-500 hover:to-purple-500 transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center space-x-2"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Test Suite</span>
        </button>
      </div>
    </aside>
  );
}
