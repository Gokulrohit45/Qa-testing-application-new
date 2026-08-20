import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  TestCaseService, AIService, ExecutionService, ProjectService, AssetService
} from '../../services/api';
import {
  Play, Sparkles, Camera, ArrowLeft, RefreshCw, CheckCircle2, XCircle,
  Clock, Terminal, Image as ImageIcon, Trash2, Plus, FileText, Video,
  FolderOpen, History, Upload, File, Download, Eye, ChevronRight, Save,
  ShieldCheck, AlertCircle
} from 'lucide-react';

const TABS = [
  { id: 'testscript', label: 'Test Script', icon: Terminal },
  { id: 'testcases', label: 'Test Cases', icon: FileText },
  { id: 'biovideo', label: 'Biometric Video', icon: Video },
  { id: 'assets', label: 'Project Assets', icon: FolderOpen },
  { id: 'history', label: 'Execution History', icon: History },
];

export default function ProjectDetails({ projects = [], onDeleteProject }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('testscript');

  const project = projects.find(p => p.id === id) || null;

  // ── Test Script State ──────────────────────────────────────────────────────
  const [rawPrompt, setRawPrompt] = useState('');
  const [translatedSteps, setTranslatedSteps] = useState([]);
  const [translating, setTranslating] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executionId, setExecutionId] = useState(null);
  const [executionStatus, setExecutionStatus] = useState(null);
  const [executionLogs, setExecutionLogs] = useState([]);
  const [headless, setHeadless] = useState(true);
  const [selectedScreenshot, setSelectedScreenshot] = useState(null);
  const pollingRef = useRef(null);

  // ── Test Cases State ───────────────────────────────────────────────────────
  const [testCases, setTestCases] = useState([]);
  const [loadingTestCases, setLoadingTestCases] = useState(false);
  const [newTcName, setNewTcName] = useState('');
  const [savingTc, setSavingTc] = useState(false);

  // ── Biometric Video State ──────────────────────────────────────────────────
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoPath, setVideoPath] = useState(project?.video_file_path || '');
  const [videoFileName, setVideoFileName] = useState('');

  // ── Assets State ───────────────────────────────────────────────────────────
  const [assets, setAssets] = useState([]);
  const [assetUploading, setAssetUploading] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);

  // ── Execution History State ────────────────────────────────────────────────
  const [execHistory, setExecHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedExec, setExpandedExec] = useState(null);
  const [expandedLogs, setExpandedLogs] = useState([]);

  // Load test cases when tab opens
  useEffect(() => {
    if (activeTab === 'testcases' && id) {
      setLoadingTestCases(true);
      TestCaseService.getTestCases(id).then(setTestCases).finally(() => setLoadingTestCases(false));
    }
    if (activeTab === 'assets' && id) {
      setLoadingAssets(true);
      AssetService.getAssets(id).then(setAssets).finally(() => setLoadingAssets(false));
    }
    if (activeTab === 'history' && id) {
      setLoadingHistory(true);
      ExecutionService.getExecutionHistory(id).then(setExecHistory).finally(() => setLoadingHistory(false));
    }
  }, [activeTab, id]);

  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  // ── AI Translation ─────────────────────────────────────────────────────────
  const handleTranslatePrompt = async () => {
    if (!rawPrompt.trim()) return;
    setTranslating(true);
    try {
      const res = await AIService.translatePrompt(rawPrompt);
      if (res?.steps) setTranslatedSteps(res.steps);
    } catch (err) {
      console.error('Translation error:', err);
    } finally {
      setTranslating(false);
    }
  };

  // ── Test Execution ─────────────────────────────────────────────────────────
  const handleRunTest = async () => {
    if (!project) return;
    setExecuting(true);
    setExecutionLogs([]);
    setExecutionStatus('Running');
    try {
      const res = await ExecutionService.triggerExecution({
        project_id: project.id,
        app_url: project.app_url,
        steps: translatedSteps.length > 0 ? translatedSteps : [
          { action: 'goto', target: project.app_url, value: '', raw_command: `Navigate to ${project.app_url}` }
        ],
        face_auth_enabled: project.face_auth_enabled,
        y4m_path: project.video_file_path,
        headless
      });
      if (res?.execution_id) {
        setExecutionId(res.execution_id);
        startPollingLogs(res.execution_id);
      }
    } catch (err) {
      alert('Local Flask daemon not running. Please start the desktop app daemon on port 5000.\n\n' + err.message);
      setExecuting(false);
      setExecutionStatus('Failed');
    }
  };

  const startPollingLogs = (execId) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const res = await ExecutionService.pollExecutionLogs(execId);
        if (res) {
          setExecutionLogs(res.logs || []);
          setExecutionStatus(res.status);
          if (['Passed', 'Failed', 'Stopped'].includes(res.status)) {
            clearInterval(pollingRef.current);
            setExecuting(false);
          }
        }
      } catch (err) { console.error('Polling error:', err); }
    }, 1500);
  };

  // ── Save Test Case ─────────────────────────────────────────────────────────
  const handleSaveTestCase = async () => {
    if (!newTcName.trim() || !rawPrompt.trim()) return;
    setSavingTc(true);
    try {
      const tc = await TestCaseService.createTestCase({
        project_id: id,
        name: newTcName,
        commands: rawPrompt,
        cached_json: translatedSteps,
        type: 'txt',
        status: 'draft'
      });
      setTestCases(prev => [tc, ...prev]);
      setNewTcName('');
      alert('Test case saved successfully!');
    } catch (err) {
      alert('Failed to save test case: ' + err.message);
    } finally {
      setSavingTc(false);
    }
  };

  const handleLoadTestCase = (tc) => {
    setRawPrompt(tc.commands || '');
    setTranslatedSteps(tc.cached_json || []);
    setActiveTab('testscript');
  };

  const handleDeleteTestCase = async (tcId) => {
    if (!window.confirm('Delete this test case?')) return;
    await TestCaseService.deleteTestCase(tcId);
    setTestCases(prev => prev.filter(tc => tc.id !== tcId));
  };

  // ── Video Upload ───────────────────────────────────────────────────────────
  const handleVideoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setVideoFileName(file.name);
    setVideoUploading(true);
    try {
      const res = await AssetService.uploadVideo(file, id);
      if (res?.y4m_path) {
        setVideoPath(res.y4m_path);
        await ProjectService.updateProject(id, { video_file_path: res.y4m_path });
      }
    } catch (err) {
      alert('Video upload failed. Make sure the desktop daemon is running on port 5000.\n' + err.message);
    } finally {
      setVideoUploading(false);
    }
  };

  // ── Asset Upload ───────────────────────────────────────────────────────────
  const handleAssetUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAssetUploading(true);
    try {
      const res = await AssetService.uploadAsset(file, id);
      setAssets(prev => [res, ...prev]);
    } catch (err) {
      alert('Asset upload failed. Make sure the desktop daemon is running on port 5000.\n' + err.message);
    } finally {
      setAssetUploading(false);
    }
  };

  // ── Expand History ─────────────────────────────────────────────────────────
  const handleExpandExec = async (execId) => {
    if (expandedExec === execId) { setExpandedExec(null); setExpandedLogs([]); return; }
    setExpandedExec(execId);
    try {
      const res = await ExecutionService.pollExecutionLogs(execId);
      setExpandedLogs(res?.logs || []);
    } catch (e) { setExpandedLogs([]); }
  };

  const handleDeleteProject = async () => {
    if (!window.confirm(`Delete project "${project?.name}"?`)) return;
    await ProjectService.deleteProject(id);
    onDeleteProject(id);
    navigate('/dashboard');
  };

  if (!project) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Project not found.</p>
          <button onClick={() => navigate('/dashboard')} className="mt-4 text-xs text-indigo-400 hover:underline">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top Banner */}
      <div className="px-8 pt-6 pb-0 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <button onClick={() => navigate('/dashboard')} className="p-2 rounded-xl bg-dark-card border border-dark-border text-slate-400 hover:text-slate-200 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              {project.name}
              {project.face_auth_enabled && (
                <span className="px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-mono flex items-center gap-1">
                  <Camera className="w-3 h-3" /> Biometric Y4M
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 font-mono">{project.app_url}</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={handleDeleteProject} className="p-2 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors" title="Delete Project">
            <Trash2 className="w-4 h-4" />
          </button>
          {activeTab === 'testscript' && (
            <button
              onClick={handleRunTest}
              disabled={executing}
              className="py-2 px-5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-xs hover:from-indigo-500 hover:to-purple-500 transition-all shadow-lg shadow-indigo-600/30 flex items-center space-x-2 disabled:opacity-50"
            >
              {executing ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span>Running...</span></> : <><Play className="w-3.5 h-3.5 fill-white" /><span>Execute Automation</span></>}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-8 pt-4 shrink-0">
        <div className="flex space-x-1 border-b border-dark-border">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? 'text-indigo-400 border-indigo-500'
                    : 'text-slate-400 border-transparent hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">

        {/* ── TAB: TEST SCRIPT ─────────────────────────────────────────────── */}
        {activeTab === 'testscript' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: AI Editor */}
            <div className="lg:col-span-5 space-y-5">
              <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" /> Natural Language Test Script
                  </span>
                  <button onClick={handleTranslatePrompt} disabled={translating} className="text-[11px] font-semibold text-indigo-400 hover:underline flex items-center gap-1">
                    {translating ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                    {translating ? 'Parsing...' : 'Re-parse with AI'}
                  </button>
                </div>
                <textarea
                  rows={7}
                  value={rawPrompt}
                  onChange={e => setRawPrompt(e.target.value)}
                  className="w-full bg-[#131926] border border-dark-border rounded-xl p-4 text-xs text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500 leading-relaxed resize-none"
                  placeholder={`Write plain English test steps here:\n\nNavigate to ${project.app_url}\nClick Sign In button\nFill email with user@example.com\nFill password with mypassword\nClick Login\nVerify Dashboard is shown`}
                />
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={headless} onChange={e => setHeadless(e.target.checked)} className="rounded border-slate-700 text-indigo-600 bg-[#131926]" />
                    <span>Run Headless Mode</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Test case name..."
                      value={newTcName}
                      onChange={e => setNewTcName(e.target.value)}
                      className="bg-[#131926] border border-dark-border rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-36"
                    />
                    <button onClick={handleSaveTestCase} disabled={savingTc || !newTcName.trim()} className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:underline disabled:opacity-40">
                      <Save className="w-3 h-3" /> Save
                    </button>
                  </div>
                </div>
              </div>

              {/* Parsed Steps */}
              <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 font-mono">Parsed Playwright Steps</span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">{translatedSteps.length} Steps</span>
                </div>
                {translatedSteps.length === 0 ? (
                  <p className="text-[11px] text-slate-500 text-center py-4">Write test steps above and click "Re-parse with AI"</p>
                ) : (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {translatedSteps.map((step, idx) => (
                      <div key={idx} className="p-2.5 rounded-xl bg-[#131926] border border-dark-border text-xs flex items-center space-x-2 font-mono">
                        <span className="w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px] font-bold flex items-center justify-center border border-indigo-500/20 shrink-0">{idx + 1}</span>
                        <span className="text-purple-400 font-semibold uppercase shrink-0">{step.action}</span>
                        <span className="text-slate-300 truncate">{step.target || step.value}</span>
                        {step.value && <span className="text-amber-400 text-[11px] truncate max-w-[80px] ml-auto">{step.value}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Live Execution Console */}
            <div className="lg:col-span-7">
              <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-4 h-full">
                <div className="flex items-center justify-between border-b border-dark-border pb-4">
                  <div className="flex items-center space-x-3">
                    {executionStatus === 'Running' && <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />}
                    {executionStatus === 'Passed' && <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />}
                    {['Failed','Stopped'].includes(executionStatus) && <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />}
                    {!executionStatus && <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />}
                    <div>
                      <h3 className="text-sm font-bold text-white">Live Playwright Execution Console</h3>
                      <p className="text-[11px] text-slate-400">
                        Status: <span className="font-semibold text-slate-200">{executionStatus || 'Idle'}</span>
                        {executionId && <span className="ml-2 font-mono text-[10px] text-indigo-400">ID: {executionId.slice(0, 8)}</span>}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">{executionLogs.length} Events</span>
                </div>

                <div className="space-y-2 min-h-[300px] max-h-[460px] overflow-y-auto pr-1">
                  {executionLogs.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-center p-6 border border-dashed border-dark-border rounded-xl">
                      <Terminal className="w-8 h-8 text-slate-600 mb-2" />
                      <p className="text-xs text-slate-400 font-medium">No execution logs yet.</p>
                      <p className="text-[11px] text-slate-500 mt-1">Click "Execute Automation" to start local Playwright runner.</p>
                    </div>
                  ) : (
                    executionLogs.map((log, index) => (
                      <div key={log.id || index} className={`p-3.5 rounded-xl border transition-all ${log.status === 'failed' ? 'bg-rose-500/10 border-rose-500/30' : 'bg-[#131926] border-dark-border hover:border-indigo-500/40'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            {log.status === 'passed' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                            {log.status === 'failed' && <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                            {log.status === 'running' && <RefreshCw className="w-4 h-4 text-amber-400 animate-spin shrink-0" />}
                            <div>
                              <span className="text-xs font-bold text-white font-mono">
                                Step {log.step_number}: <span className="text-indigo-400 uppercase">{log.action}</span>
                              </span>
                              <p className="text-xs text-slate-300 font-mono mt-0.5">{log.raw_command || `${log.action} ${log.target}`}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 shrink-0">
                            <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" />{log.duration_ms}ms</span>
                            {log.screenshot_url && (
                              <button onClick={() => setSelectedScreenshot(`http://127.0.0.1:5000${log.screenshot_url}`)} className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 flex items-center gap-1 text-[10px]">
                                <ImageIcon className="w-3 h-3" /> Capture
                              </button>
                            )}
                          </div>
                        </div>
                        {log.error_message && <div className="mt-2 p-2 rounded-lg bg-rose-950/40 text-rose-300 text-[11px] font-mono">Error: {log.error_message}</div>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: TEST CASES ──────────────────────────────────────────────── */}
        {activeTab === 'testcases' && (
          <div className="space-y-4 max-w-4xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Saved Test Cases</h3>
              <span className="text-xs text-slate-400 font-mono">{testCases.length} test cases</span>
            </div>
            {loadingTestCases ? (
              <div className="text-center py-12 text-slate-400 text-xs">Loading test cases...</div>
            ) : testCases.length === 0 ? (
              <div className="p-10 glass-card rounded-2xl border border-dashed border-slate-700 text-center">
                <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-sm font-bold text-white">No Test Cases Saved Yet</p>
                <p className="text-xs text-slate-400 mt-1">Go to the Test Script tab, write your steps, and click Save to create a test case.</p>
                <button onClick={() => setActiveTab('testscript')} className="mt-4 px-4 py-2 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-xs font-semibold hover:bg-indigo-600/30 transition-colors">
                  Go to Test Script
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {testCases.map(tc => (
                  <div key={tc.id} className="glass-card rounded-2xl p-5 border border-slate-800 flex items-center justify-between group hover:border-indigo-500/40 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{tc.name}</p>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">{(tc.cached_json?.length || 0)} steps · {tc.status || 'draft'}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{tc.commands?.split('\n')[0]}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleLoadTestCase(tc)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-500/10 text-indigo-400 text-xs font-semibold hover:bg-indigo-500/20 transition-colors"
                      >
                        <Play className="w-3 h-3 fill-indigo-400" /> Load & Run
                      </button>
                      <button onClick={() => handleDeleteTestCase(tc.id)} className="p-2 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: BIOMETRIC VIDEO ─────────────────────────────────────────── */}
        {activeTab === 'biovideo' && (
          <div className="max-w-2xl space-y-6">
            <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Biometric Face Authentication Video</h3>
                  <p className="text-xs text-slate-400">Upload an MP4 video of a face. It will be injected into the Chromium virtual webcam stream to bypass face authentication.</p>
                </div>
              </div>

              {!project.face_auth_enabled ? (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Biometric face auth is not enabled for this project. Enable it in project settings.
                </div>
              ) : (
                <>
                  {/* Current Video Status */}
                  {(project.video_file_path || videoPath) ? (
                    <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
                      <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                        <ShieldCheck className="w-4 h-4" /> Y4M Virtual Stream Ready
                      </div>
                      <p className="text-[11px] text-slate-300 font-mono truncate">{videoPath || project.video_file_path}</p>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 text-slate-400 text-xs">
                      No face video uploaded yet. Upload an MP4 below.
                    </div>
                  )}

                  {/* Upload New Video */}
                  <label className="block border-2 border-dashed border-purple-500/30 hover:border-purple-400 bg-purple-900/10 rounded-xl p-8 text-center cursor-pointer transition-colors">
                    <input type="file" accept="video/mp4,video/*" onChange={handleVideoUpload} className="hidden" />
                    <div className="flex flex-col items-center space-y-2">
                      <Upload className="w-8 h-8 text-purple-400" />
                      <span className="text-sm font-semibold text-white">
                        {videoUploading ? 'Converting to Y4M format...' : videoFileName ? videoFileName : 'Click to upload face MP4 video'}
                      </span>
                      <span className="text-xs text-slate-400">Auto-converts to 640×480 YUV4MPEG2 format for Chromium injection</span>
                      {videoUploading && <div className="w-40 h-1.5 bg-slate-700 rounded-full overflow-hidden mt-2"><div className="h-full bg-purple-500 rounded-full animate-pulse w-2/3" /></div>}
                    </div>
                  </label>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: PROJECT ASSETS ──────────────────────────────────────────── */}
        {activeTab === 'assets' && (
          <div className="space-y-5 max-w-4xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Project Assets</h3>
              <label className="flex items-center gap-2 cursor-pointer py-2 px-4 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-xs font-semibold hover:bg-indigo-600/30 transition-colors">
                <input type="file" onChange={handleAssetUpload} className="hidden" />
                <Upload className="w-3.5 h-3.5" />
                {assetUploading ? 'Uploading...' : 'Upload Asset'}
              </label>
            </div>

            {loadingAssets ? (
              <div className="text-center py-12 text-slate-400 text-xs">Loading assets...</div>
            ) : assets.length === 0 ? (
              <div className="p-10 glass-card rounded-2xl border border-dashed border-slate-700 text-center">
                <FolderOpen className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-sm font-bold text-white">No Assets Uploaded</p>
                <p className="text-xs text-slate-400 mt-1">Upload test data files, screenshots, or reference documents for this project.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {assets.map((asset, idx) => (
                  <div key={asset.id || idx} className="glass-card rounded-2xl p-4 border border-slate-800 flex items-center justify-between group hover:border-slate-700 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                        <File className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white truncate max-w-[180px]">{asset.filename || asset.name}</p>
                        <p className="text-[11px] text-slate-400 font-mono">{asset.size_kb ? `${asset.size_kb} KB` : ''}</p>
                      </div>
                    </div>
                    <button onClick={() => AssetService.deleteAsset(asset.id).then(() => setAssets(prev => prev.filter((_, i) => i !== idx)))} className="p-2 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: EXECUTION HISTORY ───────────────────────────────────────── */}
        {activeTab === 'history' && (
          <div className="space-y-4 max-w-4xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Execution History</h3>
              <span className="text-xs text-slate-400 font-mono">{execHistory.length} runs</span>
            </div>
            {loadingHistory ? (
              <div className="text-center py-12 text-slate-400 text-xs">Loading history...</div>
            ) : execHistory.length === 0 ? (
              <div className="p-10 glass-card rounded-2xl border border-dashed border-slate-700 text-center">
                <History className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-sm font-bold text-white">No Executions Yet</p>
                <p className="text-xs text-slate-400 mt-1">Run your first test from the Test Script tab and results will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {execHistory.map((exec, idx) => (
                  <div key={exec.id || idx} className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
                    <button
                      onClick={() => handleExpandExec(exec.id)}
                      className="w-full p-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {exec.status === 'Passed' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                        {exec.status === 'Failed' && <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                        {exec.status === 'Running' && <RefreshCw className="w-4 h-4 text-amber-400 animate-spin shrink-0" />}
                        <div className="text-left">
                          <p className="text-xs font-bold text-white font-mono">{exec.id?.slice(0, 8) || `Run #${idx+1}`}</p>
                          <p className="text-[11px] text-slate-400">{exec.created_at ? new Date(exec.created_at).toLocaleString() : ''} · {exec.duration_ms ? `${(exec.duration_ms/1000).toFixed(1)}s` : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold ${exec.status === 'Passed' ? 'bg-emerald-500/10 text-emerald-400' : exec.status === 'Failed' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'}`}>
                          {exec.status}
                        </span>
                        <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${expandedExec === exec.id ? 'rotate-90' : ''}`} />
                      </div>
                    </button>
                    {expandedExec === exec.id && (
                      <div className="border-t border-slate-800 p-4 space-y-2 bg-[#0d111a]">
                        {expandedLogs.length === 0 ? (
                          <p className="text-xs text-slate-500 text-center py-4">No step logs available.</p>
                        ) : expandedLogs.map((log, i) => (
                          <div key={i} className={`p-3 rounded-xl text-xs font-mono flex items-start gap-2 ${log.status === 'failed' ? 'bg-rose-500/10 text-rose-300' : 'bg-[#131926] text-slate-300'}`}>
                            {log.status === 'passed' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /> : <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />}
                            <span><span className="text-indigo-400 uppercase font-bold">{log.action}</span> {log.raw_command || log.target}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Screenshot Lightbox Modal */}
      {selectedScreenshot && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setSelectedScreenshot(null)}>
          <div className="max-w-4xl max-h-[90vh] bg-dark-card rounded-2xl overflow-hidden border border-slate-800 p-2">
            <img src={selectedScreenshot} alt="Step Screenshot" className="w-full h-auto max-h-[80vh] object-contain rounded-xl" />
            <div className="p-3 flex items-center justify-between text-xs text-slate-300 font-mono">
              <span>Playwright Step Screenshot</span>
              <span>Click anywhere to dismiss</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
