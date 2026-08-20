import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  TestCaseService, AIService, ExecutionService, ProjectService 
} from '../../services/api';
import { 
  Play, Sparkles, Camera, ArrowLeft, RefreshCw, CheckCircle2, XCircle, 
  Clock, Eye, Terminal, Image as ImageIcon, Trash2, ShieldCheck, Check
} from 'lucide-react';

export default function ProjectDetails({ projects = [], onDeleteProject }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const project = projects.find(p => p.id === id) || {
    id: id,
    name: 'HR Office Hub 360',
    app_url: 'http://officehub360.vtabsquare.com',
    description: 'Biometric face-authentication test environment',
    face_auth_enabled: true
  };

  const [rawPrompt, setRawPrompt] = useState(
    "Navigate to http://officehub360.vtabsquare.com\nClick on 'Biometric Clock In'\nWait for face camera detection 3 seconds\nClick on 'Confirm Attendance'\nVerify 'Check-in Successful'"
  );
  const [translatedSteps, setTranslatedSteps] = useState([]);
  const [translating, setTranslating] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executionId, setExecutionId] = useState(null);
  const [executionStatus, setExecutionStatus] = useState(null); // 'Running', 'Passed', 'Failed'
  const [executionLogs, setExecutionLogs] = useState([]);
  const [headless, setHeadless] = useState(true);
  const [selectedScreenshot, setSelectedScreenshot] = useState(null);

  // Polling ref
  const pollingRef = useRef(null);

  // Auto-translate prompt on mount
  useEffect(() => {
    handleTranslatePrompt();
  }, [id]);

  const handleTranslatePrompt = async () => {
    if (!rawPrompt.trim()) return;
    setTranslating(true);
    try {
      const res = await AIService.translatePrompt(rawPrompt);
      if (res.steps) {
        setTranslatedSteps(res.steps);
      }
    } catch (err) {
      console.error('Translation error:', err);
    } finally {
      setTranslating(false);
    }
  };

  const handleRunTest = async () => {
    setExecuting(true);
    setExecutionLogs([]);
    setExecutionStatus('Running');

    try {
      const res = await ExecutionService.triggerExecution({
        project_id: project.id,
        app_url: project.app_url,
        steps: translatedSteps.length > 0 ? translatedSteps : [
          { action: "goto", target: project.app_url, value: "", raw_command: `Navigate to ${project.app_url}` }
        ],
        face_auth_enabled: project.face_auth_enabled,
        y4m_path: project.video_file_path,
        headless: headless
      });

      if (res.execution_id) {
        setExecutionId(res.execution_id);
        startPollingLogs(res.execution_id);
      }
    } catch (err) {
      alert('Failed to launch Playwright execution: ' + err.message);
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

          if (res.status === 'Passed' || res.status === 'Failed' || res.status === 'Stopped') {
            clearInterval(pollingRef.current);
            setExecuting(false);
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 1500);
  };

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const handleDelete = async () => {
    if (window.confirm(`Delete project "${project.name}"?`)) {
      await ProjectService.deleteProject(project.id);
      onDeleteProject(project.id);
      navigate('/dashboard');
    }
  };

  return (
    <div className="p-8 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* Top Banner */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 rounded-xl bg-dark-card border border-dark-border text-slate-400 hover:text-slate-200"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              {project.name}
              {project.face_auth_enabled && (
                <span className="px-2.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-mono flex items-center gap-1">
                  <Camera className="w-3 h-3" /> Biometric Y4M Active
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{project.app_url}</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleDelete}
            className="p-2.5 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-xs transition-colors"
            title="Delete Project"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          
          <button
            onClick={handleRunTest}
            disabled={executing}
            className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-xs hover:from-indigo-500 hover:to-purple-500 transition-all shadow-lg shadow-indigo-600/30 flex items-center space-x-2 disabled:opacity-50"
          >
            {executing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>Running Playwright...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>Execute Automation</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Grid: Prompt Builder (Left) vs Execution Console (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: AI Step Translator & Natural Language Editor (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" /> Natural Language Test Script
              </span>
              <button
                onClick={handleTranslatePrompt}
                disabled={translating}
                className="text-[11px] font-semibold text-indigo-400 hover:underline flex items-center gap-1"
              >
                {translating ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Re-parse Step AI'}
              </button>
            </div>

            <textarea
              rows={6}
              value={rawPrompt}
              onChange={(e) => setRawPrompt(e.target.value)}
              className="w-full bg-[#131926] border border-dark-border rounded-xl p-4 text-xs text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500 leading-relaxed"
              placeholder="Enter plain text test steps..."
            />

            {/* Execution Options */}
            <div className="pt-2 flex items-center justify-between text-xs text-slate-400">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={headless}
                  onChange={(e) => setHeadless(e.target.checked)}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-[#131926]"
                />
                <span>Run Headless Mode</span>
              </label>
            </div>
          </div>

          {/* Translated Playwright Step Array JSON */}
          <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 font-mono">Parsed Playwright Steps Array</span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                {translatedSteps.length} Steps
              </span>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {translatedSteps.map((step, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-[#131926] border border-dark-border text-xs flex items-center justify-between font-mono">
                  <div className="flex items-center space-x-2 truncate">
                    <span className="w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px] font-bold flex items-center justify-center border border-indigo-500/20">
                      {idx + 1}
                    </span>
                    <span className="text-purple-400 font-semibold uppercase">{step.action}</span>
                    <span className="text-slate-300 truncate">{step.target || step.value}</span>
                  </div>
                  {step.value && <span className="text-amber-400 text-[11px] truncate max-w-[100px]">{step.value}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Live Playwright Step Audit & Screenshots Console (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
            
            {/* Console Header with Dynamic Pulse Status Dot */}
            <div className="flex items-center justify-between border-b border-dark-border pb-4">
              <div className="flex items-center space-x-3">
                {/* Live Status Dot Requirements */}
                {executionStatus === 'Running' && <div className="pulse-red-dot" title="Live Execution Running" />}
                {executionStatus === 'Passed' && <div className="solid-green-dot" title="Live Execution Finished" />}
                {(executionStatus === 'Failed' || executionStatus === 'Stopped') && <div className="solid-red-dot" title="Live Execution Stopped" />}
                {!executionStatus && <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />}

                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Live Playwright Execution Console
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Status: <span className="font-semibold text-slate-200">{executionStatus || 'Idle'}</span>
                    {executionId && <span className="ml-2 font-mono text-[10px] text-indigo-400">ID: {executionId.slice(0, 8)}</span>}
                  </p>
                </div>
              </div>

              <div className="text-xs text-slate-400 font-mono">
                {executionLogs.length} Events Captured
              </div>
            </div>

            {/* Step Audit Cards Container */}
            <div className="space-y-3 min-h-[320px] max-h-[480px] overflow-y-auto pr-2">
              {executionLogs.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 border border-dashed border-dark-border rounded-xl">
                  <Terminal className="w-8 h-8 text-slate-600 mb-2" />
                  <p className="text-xs text-slate-400 font-medium">No execution logs yet.</p>
                  <p className="text-[11px] text-slate-500 mt-1">Click "Execute Automation" to launch live Playwright sync worker.</p>
                </div>
              ) : (
                executionLogs.map((log, index) => (
                  <div
                    key={log.id || index}
                    className={`p-4 rounded-xl border transition-all ${
                      log.status === 'failed'
                        ? 'bg-rose-500/10 border-rose-500/30'
                        : 'bg-[#131926] border-dark-border hover:border-indigo-500/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {log.status === 'passed' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                        {log.status === 'failed' && <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                        {log.status === 'running' && <RefreshCw className="w-4 h-4 text-amber-400 animate-spin shrink-0" />}

                        <div>
                          <span className="text-xs font-bold text-white font-mono">
                            Step {log.step_number}: <span className="text-indigo-400 uppercase">{log.action}</span>
                          </span>
                          <p className="text-xs text-slate-300 font-mono mt-0.5">
                            {log.raw_command || `${log.action} ${log.target}`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {log.duration_ms}ms
                        </span>

                        {log.screenshot_url && (
                          <button
                            onClick={() => setSelectedScreenshot(`http://127.0.0.1:5000${log.screenshot_url}`)}
                            className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 text-xs flex items-center space-x-1"
                            title="View Screenshot"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            <span className="text-[10px]">Capture</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {log.error_message && (
                      <div className="mt-2 p-2 rounded-lg bg-rose-950/40 text-rose-300 text-[11px] font-mono">
                        Error: {log.error_message}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Screenshot Lightbox Modal */}
      {selectedScreenshot && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setSelectedScreenshot(null)}
        >
          <div className="max-w-4xl max-h-[90vh] bg-dark-card rounded-2xl overflow-hidden border border-slate-800 p-2 relative">
            <img
              src={selectedScreenshot}
              alt="Playwright Step Screenshot"
              className="w-full h-auto max-h-[80vh] object-contain rounded-xl"
            />
            <div className="p-3 flex items-center justify-between text-xs text-slate-300 font-mono">
              <span>Playwright Captured Step Screenshot</span>
              <span>Click anywhere to dismiss</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
