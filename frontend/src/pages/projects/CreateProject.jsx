import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProjectService, AssetService } from '../../services/api';
import { ArrowLeft, Lock, Camera, Upload, CheckCircle, Globe } from 'lucide-react';

export default function CreateProject({ onProjectCreated }) {
  const [name, setName] = useState('');
  const [appName, setAppName] = useState('');
  const [appUrl, setAppUrl] = useState('http://officehub360.vtabsquare.com');
  const [description, setDescription] = useState('');
  const [faceAuthEnabled, setFaceAuthEnabled] = useState(false);
  const [videoFile, setVideoFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [y4mPath, setY4mPath] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleVideoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setVideoFile(file);
    setUploading(true);

    try {
      const res = await AssetService.uploadVideo(file);
      if (res?.y4m_path) {
        setY4mPath(res.y4m_path);
      }
    } catch (err) {
      alert('Failed to process video: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !appUrl) return;

    setLoading(true);

    const projectPayload = {
      name,
      app_name: appName || name,
      app_url: appUrl,
      description,
      face_auth_enabled: faceAuthEnabled,
      video_file_path: y4mPath
    };

    try {
      const created = await ProjectService.createProject(projectPayload);
      if (onProjectCreated) onProjectCreated(created);
      navigate(`/projects/${created.id}`);
    } catch (err) {
      alert('Failed to create project: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6 overflow-y-auto max-h-[calc(100vh-3.5rem)]">
      {/* Back Button */}
      <button
        onClick={() => navigate('/dashboard')}
        className="w-9 h-9 rounded-xl bg-dark-card border border-dark-border flex items-center justify-center text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Create New Project</h2>
        <p className="text-xs text-slate-400 mt-1">
          Configure a new testing workspace for your web application.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-8 border border-slate-800 space-y-6">
        {/* Project Name */}
        <div>
          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            PROJECT NAME
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Billing Dashboard"
            className="w-full bg-[#131926] border border-dark-border rounded-xl px-4 py-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Application Name + Target URL */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              APPLICATION NAME
            </label>
            <input
              type="text"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="e.g. Acme Web Client"
              className="w-full bg-[#131926] border border-dark-border rounded-xl px-4 py-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              TARGET URL
            </label>
            <div className="relative">
              <input
                type="url"
                required
                value={appUrl}
                onChange={(e) => setAppUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full bg-[#131926] border border-dark-border rounded-xl px-4 py-3 pl-10 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
              <Globe className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            DESCRIPTION
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the application flow, test scope, and any relevant notes..."
            className="w-full bg-[#131926] border border-dark-border rounded-xl p-4 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 leading-relaxed resize-none"
          />
        </div>

        {/* Authentication Configuration Card */}
        <div className="p-6 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Lock className="w-5 h-5 text-indigo-400" />
              <div>
                <h4 className="text-sm font-bold text-white">Authentication Configuration</h4>
                <p className="text-xs text-slate-400">Configure optional Face Verification for 2FA logins.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFaceAuthEnabled(!faceAuthEnabled)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center space-x-1.5 transition-all ${
                faceAuthEnabled
                  ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{faceAuthEnabled ? 'Face Auth Enabled' : 'Face Auth Disabled'}</span>
            </button>
          </div>

          <div className="p-4 rounded-xl bg-[#131926] border border-dark-border text-xs text-slate-300 space-y-1 font-mono">
            <p>• <strong>Username/Email & Password:</strong> Supplied directly inside your test case commands (e.g. <span className="text-amber-400">fill Email..., fill Password...</span>).</p>
            <p>• <strong>Biometric Face Verification:</strong> Playwright streams virtual webcam video for face recognition logins.</p>
          </div>

          {faceAuthEnabled && (
            <div className="pt-2 space-y-3">
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Upload Virtual Webcam Input Video (.mp4 / .y4m)
              </label>
              <label className="block border-2 border-dashed border-indigo-500/30 hover:border-indigo-400 bg-indigo-900/10 rounded-xl p-6 text-center cursor-pointer transition-colors">
                <input
                  type="file"
                  accept="video/mp4,video/x-y4m"
                  onChange={handleVideoUpload}
                  className="hidden"
                />
                <div className="flex flex-col items-center space-y-2">
                  <Upload className="w-6 h-6 text-indigo-400" />
                  <span className="text-xs text-slate-200 font-semibold">
                    {uploading ? 'Processing Video...' : videoFile ? videoFile.name : 'Click to select MP4 video'}
                  </span>
                </div>
              </label>

              {y4mPath && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center space-x-2 font-mono">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span className="truncate">Y4M Stream Ready: {y4mPath}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Submit button */}
        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={loading || uploading}
            className="py-3 px-8 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-semibold hover:from-indigo-500 hover:to-purple-500 transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-50"
          >
            {loading ? 'Creating Project...' : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  );
}
