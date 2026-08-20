import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FolderGit2, Play, CheckCircle2, XCircle, Camera, Sparkles, Plus, 
  ArrowUpRight, ShieldCheck, Activity, Clock
} from 'lucide-react';

export default function Dashboard({ projects = [], onSelectProject }) {
  const navigate = useNavigate();

  const activeProjectsCount = projects.length;
  const biometricCount = projects.filter(p => p.face_auth_enabled).length;

  return (
    <div className="p-8 space-y-8 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* Header Banner */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Autonomous QA Workspace</h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time Playwright execution driver, biometric Y4M camera bypass, and Gemini AI natural language step translation.
          </p>
        </div>
        <button
          onClick={() => navigate('/projects/new')}
          className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-xs hover:from-indigo-500 hover:to-purple-500 transition-all shadow-lg shadow-indigo-600/25 flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>New Project Suite</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800/80 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Projects</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <FolderGit2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white mt-2">{activeProjectsCount}</div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1 mt-2">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Fully persistent offline & cloud</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800/80 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Biometric Bypass</span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white mt-2">{biometricCount} Enabled</div>
          <div className="text-[11px] text-purple-400 flex items-center gap-1 mt-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Y4M Virtual Stream Injector</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800/80 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pass Rate</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white mt-2">98.4%</div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1 mt-2">
            <span>+2.1% from last execution batch</span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800/80 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">AI Translation</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white mt-2">Gemini Pro</div>
          <div className="text-[11px] text-amber-400 flex items-center gap-1 mt-2">
            <span>Natural language step conversion</span>
          </div>
        </div>
      </div>

      {/* Workspace Projects Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <span>Workspace Test Projects</span>
            <span className="text-xs font-normal text-slate-400">({projects.length})</span>
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((proj) => (
            <div
              key={proj.id}
              onClick={() => {
                onSelectProject(proj);
                navigate(`/projects/${proj.id}`);
              }}
              className="glass-card rounded-2xl p-6 border border-slate-800 hover:border-indigo-500/50 transition-all cursor-pointer group hover:-translate-y-1 relative"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                  <FolderGit2 className="w-5 h-5" />
                </div>
                {proj.face_auth_enabled && (
                  <span className="px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-mono flex items-center gap-1">
                    <Camera className="w-3 h-3" /> Biometric Y4M
                  </span>
                )}
              </div>

              <h4 className="text-base font-bold text-white group-hover:text-indigo-400 transition-colors">
                {proj.name}
              </h4>
              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                {proj.description || 'Automated Playwright testing project setup.'}
              </p>

              <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono text-[11px] text-slate-500 truncate max-w-[180px]">
                  {proj.app_url}
                </span>
                <span className="text-indigo-400 font-medium group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                  Open Suite <Play className="w-3 h-3 fill-indigo-400" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
