import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, Play, CheckCircle2, XCircle, Clock, ArrowRight, TrendingUp, Activity, Layers, Globe, PlusCircle, Trash2 } from 'lucide-react';

export default function Dashboard({ projects, executions, onDeleteProject }) {
  const [deleteModalProj, setDeleteModalProj] = useState(null);

  const totalRuns = executions.length;
  const passed    = executions.filter(e => e.status === 'Passed').length;
  const failed    = executions.filter(e => e.status === 'Failed').length;
  const rate      = totalRuns > 0 ? Math.round((passed / totalRuns) * 100) : 0;

  const confirmDelete = async () => {
    if (deleteModalProj && onDeleteProject) {
      await onDeleteProject(deleteModalProj.id);
      setDeleteModalProj(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black text-primary tracking-tight">Good morning 👋</h1>
          <p className="text-secondary text-sm mt-1">Here's an overview of your automation workspace.</p>
        </div>
        <Link to="/projects/create" className="btn-primary">
          <PlusCircle size={16}/> New Project
        </Link>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Projects"    value={projects.length}  icon={<Layers size={18}    className="text-indigo-600 dark:text-indigo-400" />}  iconBg="bg-indigo-50 dark:bg-indigo-500/10 border-indigo-100 dark:border-indigo-500/20" trend="+2 this month" />
        <MetricCard label="Total Runs"        value={totalRuns}        icon={<Activity size={18}  className="text-violet-600 dark:text-violet-400"  />}  iconBg="bg-violet-50 dark:bg-violet-500/10 border-violet-100 dark:border-violet-500/20"  trend={`${passed} passed`} />
        <MetricCard label="Success Rate"      value={`${rate}%`}       icon={<TrendingUp size={18} className="text-emerald-600 dark:text-emerald-400"  />} iconBg="bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20" trend="↑ vs last week" positive />
        <MetricCard label="Failures"          value={failed}           icon={<XCircle size={18}   className="text-red-600 dark:text-red-400"        />}  iconBg="bg-red-50 dark:bg-red-500/10 border-red-100 dark:border-red-500/20"         trend={failed > 0 ? "Needs attention" : "All clear"} negative={failed > 0} />
      </div>

      {/* Active Projects */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-primary uppercase tracking-wider">Active Projects</h2>
          <Link to="/projects/create" className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-semibold flex items-center gap-1 transition-colors">
            View all <ArrowRight size={12}/>
          </Link>
        </div>

        <div className="space-y-3">
          {projects.map(p => {
            const pRuns   = executions.filter(e => e.projectId === p.id || e.project_id === p.id);
            const pPassed = pRuns.filter(e => e.status === 'Passed').length;
            const pRate   = pRuns.length > 0 ? Math.round((pPassed / pRuns.length) * 100) : 0;
            return (
              <div key={p.id} className="card card-hover p-5 flex items-center justify-between group">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                    <Globe size={18} className="text-indigo-600 dark:text-indigo-400"/>
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-primary text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">{p.name}</h3>
                    <p className="text-[11px] text-muted font-mono truncate mt-0.5">{p.app_url || p.appUrl}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                  <div className="hidden md:block space-y-1 w-24">
                    <div className="flex justify-between text-[10px] text-muted">
                      <span>Success</span>
                      <span className="text-primary font-semibold">{pRate}%</span>
                    </div>
                    <div className="h-1 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full gradient-brand rounded-full" style={{ width:`${pRate}%` }} />
                    </div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Link to={`/projects/${p.id}`} className="btn-ghost !py-1.5 !px-3 text-xs">Open</Link>
                    <Link to={`/projects/${p.id}`} className="btn-primary !py-1.5 !px-3 text-xs">
                      <Play size={11}/> Run
                    </Link>
                    <button
                      onClick={() => setDeleteModalProj(p)}
                      title="Delete project"
                      className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all ml-1"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {projects.length === 0 && (
            <div className="card p-12 text-center">
              <Layers size={32} className="text-muted mx-auto mb-3"/>
              <p className="text-secondary text-sm">No projects yet.</p>
              <Link to="/projects/create" className="btn-primary mt-4 mx-auto w-fit"><PlusCircle size={14}/> Create Project</Link>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModalProj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setDeleteModalProj(null)}>
          <div className="card p-6 max-w-md w-full space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-950/50 flex items-center justify-center">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-zinc-100 text-base">Delete Project</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
              Are you sure you want to delete <strong className="text-slate-900 dark:text-zinc-100">{deleteModalProj.name}</strong>?
              This will permanently remove all associated test cases, test suites, and execution logs.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDeleteModalProj(null)} className="btn-ghost text-xs px-4 py-2">
                Cancel
              </button>
              <button onClick={confirmDelete} className="px-4 py-2 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs transition-all shadow-md shadow-red-500/20">
                Delete Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, icon, iconBg, trend, positive, negative }) {
  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="section-label">{label}</span>
        <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${iconBg}`}>{icon}</div>
      </div>
      <div className="text-3xl font-black text-primary">{value}</div>
      <p className={`text-[11px] font-medium ${positive ? 'text-emerald-600 dark:text-emerald-400' : negative ? 'text-red-600 dark:text-red-400' : 'text-muted'}`}>
        {trend}
      </p>
    </div>
  );
}
