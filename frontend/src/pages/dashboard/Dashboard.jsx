import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, Globe, Play, Trash2, Layers, Activity, TrendingUp, AlertTriangle, 
  CheckCircle2, XCircle, Clock, ArrowRight
} from 'lucide-react';
import { ProjectService, ExecutionService } from '../../services/api';

export default function Dashboard({ projects = [], onSelectProject, onDeleteProject }) {
  const navigate = useNavigate();
  const [recentRuns, setRecentRuns] = useState([]);

  useEffect(() => {
    // Load recent executions history
    ExecutionService.getExecutionHistory().then((history) => {
      if (Array.isArray(history)) {
        setRecentRuns(history.slice(0, 8));
      }
    }).catch(() => {});
  }, []);

  const totalProjects = projects.length;
  const totalRuns = recentRuns.length || 0;
  const passedRuns = recentRuns.filter(r => r.status === 'Passed').length;
  const failedRuns = recentRuns.filter(r => r.status === 'Failed').length;
  const successRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 0;

  const handleDelete = async (e, projectId, projectName) => {
    e.stopPropagation();
    if (window.confirm(`Delete project "${projectName}"?`)) {
      await ProjectService.deleteProject(projectId);
      if (onDeleteProject) onDeleteProject(projectId);
    }
  };

  return (
    <div className="p-8 space-y-8 min-h-full">
      {/* Top Banner */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Good morning <span className="text-2xl">👋</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Here's an overview of your automation workspace.
          </p>
        </div>
        <button
          onClick={() => navigate('/projects/new')}
          className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-xs hover:from-indigo-500 hover:to-purple-500 transition-all shadow-lg shadow-indigo-600/30 flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>New Project</span>
        </button>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: TOTAL PROJECTS */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">TOTAL PROJECTS</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white">{totalProjects}</div>
          <p className="text-[11px] text-slate-400 font-mono">+2 this month</p>
        </div>

        {/* Card 2: TOTAL RUNS */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">TOTAL RUNS</span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white">{totalRuns}</div>
          <p className="text-[11px] text-slate-400 font-mono">{passedRuns} passed</p>
        </div>

        {/* Card 3: SUCCESS RATE */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">SUCCESS RATE</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white">{successRate}%</div>
          <p className="text-[11px] text-emerald-400 font-mono">↑ vs last week</p>
        </div>

        {/* Card 4: FAILURES */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">FAILURES</span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center border border-rose-500/20">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white">{failedRuns}</div>
          <p className="text-[11px] text-rose-400 font-mono">{failedRuns > 0 ? 'Needs attention' : 'All clear'}</p>
        </div>
      </div>

      {/* Main Grid: ACTIVE PROJECTS (Left 7 cols) vs RECENT RUNS (Right 5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: ACTIVE PROJECTS */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">ACTIVE PROJECTS</h3>
            <span className="text-xs text-indigo-400 font-semibold cursor-pointer hover:underline">View all →</span>
          </div>

          {projects.length === 0 ? (
            <div className="p-8 glass-card rounded-2xl border border-dashed border-slate-700 text-center space-y-3">
              <p className="text-xs text-slate-400">No active projects found in workspace.</p>
              <button
                onClick={() => navigate('/projects/new')}
                className="px-4 py-2 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-xs font-semibold hover:bg-indigo-600/30 transition-colors"
              >
                Create Project
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  onClick={() => {
                    onSelectProject(proj);
                    navigate(`/projects/${proj.id}`);
                  }}
                  className="glass-card rounded-2xl p-4 border border-slate-800 flex items-center justify-between hover:border-indigo-500/40 transition-all cursor-pointer group"
                >
                  <div className="flex items-center space-x-3.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                      <Globe className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white group-hover:text-indigo-400 transition-colors truncate">
                        {proj.name}
                      </h4>
                      <div className="flex items-center space-x-2 text-[10px] text-slate-400 font-mono mt-0.5">
                        <span>Success</span>
                        <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-400 rounded-full w-0" />
                        </div>
                        <span>0%</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectProject(proj);
                        navigate(`/projects/${proj.id}`);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs font-medium hover:bg-slate-800 transition-colors"
                    >
                      Open
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectProject(proj);
                        navigate(`/projects/${proj.id}`);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-colors flex items-center space-x-1 shadow-md shadow-indigo-600/20"
                    >
                      <Play className="w-3 h-3 fill-white" />
                      <span>Run</span>
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, proj.id, proj.name)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                      title="Delete Project"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: RECENT RUNS */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">RECENT RUNS</h3>
          </div>

          <div className="glass-card rounded-2xl p-4 border border-slate-800 space-y-3 min-h-[300px]">
            {recentRuns.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-800 rounded-xl">
                <Clock className="w-8 h-8 text-slate-600 mb-2" />
                <p className="text-xs text-slate-400 font-medium">No recent test runs.</p>
                <p className="text-[11px] text-slate-500 mt-1">Execute a test suite from any project to see history here.</p>
              </div>
            ) : (
              recentRuns.map((run, idx) => (
                <div
                  key={run.id || idx}
                  className="p-3 rounded-xl bg-[#131926] border border-dark-border flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5">
                    <p className="font-bold text-white font-mono">{run.project_name || run.id?.slice(0, 8) || `Run #${idx + 1}`}</p>
                    <p className="text-[10px] text-slate-400 font-mono">
                      ⏱ {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(0)}s` : '0s'} · {run.created_at ? new Date(run.created_at).toLocaleString() : ''}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold flex items-center gap-1 ${
                      run.status === 'Passed'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : run.status === 'Running'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}
                  >
                    {run.status === 'Passed' && <CheckCircle2 className="w-3 h-3" />}
                    {run.status === 'Failed' && <XCircle className="w-3 h-3" />}
                    {run.status || 'Passed'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
