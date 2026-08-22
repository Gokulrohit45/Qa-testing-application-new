import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Briefcase, Link2, FileText, Zap, ToggleLeft, ToggleRight, Upload } from 'lucide-react';
import { AssetService, ProjectService } from '../../services/api';

export default function CreateProject({ projects, setProjects }) {
  const [form, setForm] = useState({ name:'', appName:'', appUrl:'', description:'' });
  const [faceAuthEnabled, setFaceAuthEnabled] = useState(false);
  const [faceVideoFile, setFaceVideoFile]     = useState(null);
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const newProject = {
      name: form.name,
      app_name: form.appName || form.name,
      app_url: form.appUrl.startsWith('http') ? form.appUrl : `https://${form.appUrl}`,
      description: form.description,
      face_auth_enabled: faceAuthEnabled
    };

    const created = await setProjects(newProject);

    if (created?.id && faceVideoFile) {
      try {
        const uploaded = await AssetService.uploadVideo(faceVideoFile, created.id);
        await ProjectService.updateProject(created.id, { video_file_path: uploaded.y4m_path });
      } catch (err) {
        alert(`Project created, but face video preparation failed: ${err.message}`);
      }
    }

    setSubmitting(false);
    navigate('/');
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-2xl bg-white dark:bg-[#161925] hover:bg-slate-100 dark:hover:bg-[#1d2132] flex items-center justify-center text-secondary hover:text-primary transition-colors flex-shrink-0 shadow-sm">
          <ArrowLeft size={15}/>
        </button>
        <div>
          <h1 className="text-xl font-black text-primary tracking-tight">Create New Project</h1>
          <p className="text-secondary text-xs mt-0.5">Configure a new testing workspace for your web application.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5 shadow-sm">
        <div className="space-y-1.5">
          <label className="section-label">Project Name</label>
          <div className="relative flex items-center">
            <Briefcase size={15} className="absolute left-3.5 text-muted pointer-events-none" />
            <input type="text" required value={form.name} onChange={e => setForm({...form, name:e.target.value})}
              placeholder="e.g. Acme Billing Dashboard" className="input-field input-field-icon" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="section-label">Application Name</label>
            <input type="text" value={form.appName} onChange={e => setForm({...form, appName:e.target.value})}
              placeholder="e.g. Acme Web Client" className="input-field" />
          </div>
          <div className="space-y-1.5">
            <label className="section-label">Target URL</label>
            <div className="relative flex items-center">
              <Link2 size={15} className="absolute left-3.5 text-muted pointer-events-none" />
              <input type="text" required value={form.appUrl} onChange={e => setForm({...form, appUrl:e.target.value})}
                placeholder="https://example.com" className="input-field input-field-icon" />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="section-label">Description</label>
          <div className="relative flex">
            <FileText size={15} className="absolute left-3.5 top-3.5 text-muted pointer-events-none" />
            <textarea rows={4} value={form.description} onChange={e => setForm({...form, description:e.target.value})}
              placeholder="Describe the application flow, test scope, and any relevant notes..."
              className="input-field input-field-icon pt-3 resize-none" />
          </div>
        </div>

        {/* Authentication Configuration Section */}
        <div className="p-4 rounded-xl border border-indigo-500/20 bg-slate-900 text-white space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="font-bold text-sm text-indigo-400 flex items-center gap-1.5">
                <span>🔐</span> Authentication Configuration
              </p>
              <p className="text-[11px] text-slate-400">Configure optional Face Verification for 2FA logins.</p>
            </div>
            <button
              type="button"
              onClick={() => setFaceAuthEnabled(!faceAuthEnabled)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${faceAuthEnabled ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}
            >
              {faceAuthEnabled ? <ToggleRight size={16}/> : <ToggleLeft size={16}/>}
              {faceAuthEnabled ? 'Face Auth Enabled' : 'Face Auth Disabled'}
            </button>
          </div>

          <div className="text-[11px] text-slate-400 leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-1">
            <p>• <strong>Username/Email &amp; Password:</strong> Supplied directly inside your test case commands (e.g. <code className="text-amber-300 font-mono">fill Email...</code>, <code className="text-amber-300 font-mono">fill Password...</code>).</p>
            <p>• <strong>Biometric Face Verification:</strong> Playwright streams virtual webcam video for face recognition logins.</p>
          </div>

          {faceAuthEnabled && (
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <p className="text-xs font-semibold text-indigo-300">📷 Upload Face Verification Video (.mp4 / .y4m)</p>
              <label className="border-2 border-dashed border-indigo-500/40 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-indigo-950/30 transition-all">
                <Upload size={20} className="text-indigo-400 mb-1"/>
                <span className="text-xs font-bold text-indigo-200">
                  {faceVideoFile ? `Selected: ${faceVideoFile.name}` : 'Click to select face verification video'}
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5">Supported formats: MP4, Y4M</span>
                <input
                  type="file"
                  accept="video/mp4,video/y4m"
                  onChange={e => setFaceVideoFile(e.target.files[0] || null)}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={submitting} className="btn-primary px-6">
            <Zap size={15}/> {submitting ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  );
}
