import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProjectService, AssetService } from '../../services/api';
import { FolderPlus, Camera, Upload, ArrowLeft, CheckCircle, Video, Globe } from 'lucide-react';

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
      if (res.y4m_path) {
        setY4mPath(res.y4m_path);
      }
    } catch (err) {
      alert('Failed to convert video to Y4M format: ' + err.message);
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
      onProjectCreated(created);
      navigate(`/projects/${created.id}`);
    } catch (err) {
      alert('Failed to create project: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
      <button
        onClick={() => navigate('/dashboard')}
        className="inline-flex items-center space-x-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Dashboard</span>
      </button>

      <div className="glass-card rounded-2xl p-8 border border-slate-800 space-y-6">
        <div className="border-b border-dark-border pb-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Create Automation Project</h2>
              <p className="text-xs text-slate-400">Configure target web application & biometric virtual camera settings.</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Project Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. HR Biometric Clock-In Suite"
                className="w-full bg-[#131926] border border-dark-border rounded-xl px-4 py-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Application Name
              </label>
              <input
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="e.g. OfficeHub 360"
                className="w-full bg-[#131926] border border-dark-border rounded-xl px-4 py-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Target Application URL *
            </label>
            <div className="relative">
              <input
                type="url"
                required
                value={appUrl}
                onChange={(e) => setAppUrl(e.target.value)}
                placeholder="http://officehub360.vtabsquare.com"
                className="w-full bg-[#131926] border border-dark-border rounded-xl px-4 py-3 pl-10 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
              <Globe className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the scope, user roles, and biometric verification targets..."
              className="w-full bg-[#131926] border border-dark-border rounded-xl p-4 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Biometric Virtual Camera Card */}
          <div className="p-6 rounded-2xl bg-indigo-950/20 border border-indigo-500/30 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Camera className="w-5 h-5 text-indigo-400" />
                <div>
                  <h4 className="text-sm font-bold text-white">Biometric Face Authentication Bypass</h4>
                  <p className="text-xs text-slate-400">Injects custom Y4M video into Chromium virtual media driver.</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={faceAuthEnabled}
                  onChange={(e) => setFaceAuthEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {faceAuthEnabled && (
              <div className="pt-4 border-t border-indigo-500/20 space-y-3">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Upload Face Verification Video (MP4)
                </label>
                <div className="flex items-center space-x-4">
                  <label className="flex-1 border-2 border-dashed border-indigo-500/40 hover:border-indigo-400 bg-indigo-900/10 rounded-xl p-4 text-center cursor-pointer transition-colors">
                    <input
                      type="file"
                      accept="video/mp4"
                      onChange={handleVideoUpload}
                      className="hidden"
                    />
                    <div className="flex flex-col items-center space-y-1">
                      <Upload className="w-5 h-5 text-indigo-400" />
                      <span className="text-xs text-slate-300 font-medium">
                        {uploading ? 'Processing & Converting to Y4M...' : videoFile ? videoFile.name : 'Click to select MP4 video'}
                      </span>
                      <span className="text-[10px] text-slate-500">Auto-scales to 640x480 YUV4MPEG2 format</span>
                    </div>
                  </label>
                </div>

                {y4mPath && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center space-x-2 font-mono">
                    <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span className="truncate">Y4M Stream Ready: {y4mPath}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="pt-4 flex items-center justify-end space-x-4">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="py-2.5 px-5 rounded-xl border border-dark-border text-slate-300 text-xs font-medium hover:bg-dark-card transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || uploading}
              className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-semibold hover:from-indigo-500 hover:to-purple-500 transition-all shadow-lg shadow-indigo-600/30"
            >
              {loading ? 'Creating Project...' : 'Initialize Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
