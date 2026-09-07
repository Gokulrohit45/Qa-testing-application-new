import DraftTools from '../../components/DraftTools';
import WorkspaceTools from '../../components/WorkspaceTools';
import StepOutcome from '../../components/StepOutcome';
import { summarizeRun } from '../../lib/runSummary';
import TestStepBuilder from '../../components/TestStepBuilder';
import { parseTestCsv, describeSteps, variableNames, SAMPLE_CSV } from '../../lib/testDefinition';
import React, { useState, useEffect, useRef } from 'react';
import html2pdf from 'html2pdf.js';
import { useParams, useNavigate } from 'react-router-dom';
import {
  TestCaseService, AIService, ExecutionService, ProjectService, AssetService, localAssetUrl
} from '../../services/api';
import {
  Play, Sparkles, ArrowLeft, RefreshCw, CheckCircle2, XCircle,
  Clock, Trash2, Plus, FileText, Upload, Download, Eye, ChevronRight,
  ShieldCheck, AlertCircle, Lock, Globe, Search, StopCircle, FileSpreadsheet,
  Activity, PlusCircle, ToggleLeft, ToggleRight, Paperclip, Image as ImageIcon,
  Video, Edit3
} from 'lucide-react';

const TABS = [
  { id: 'overview',  label: 'Overview'       },
  { id: 'testcases', label: 'Test Cases'      },
  { id: 'assets',    label: 'Project Assets'  },
  { id: 'upload',    label: 'Upload'          },
  { id: 'runsuite',  label: 'Run Suite'       },
  { id: 'history',   label: 'History'         },
  { id: 'results',   label: 'Results'         },
  { id: 'report',    label: 'Report'          },
];

const isFailedLog = log => ['failed', 'Failed'].includes(log?.status);
const isSkippedLog = log => ['skipped', 'Skipped'].includes(log?.status);

function classifyFailure(log) {
  if (!log) return { category: 'none', recommendation: 'No failed UI step was recorded.' };
  const text = `${log.action || ''} ${log.target || ''} ${log.error_message || ''}`.toLowerCase();
  if (/blocked by|overlay|intercepts pointer|covered/.test(text)) {
    return { category: 'Blocked by overlay', recommendation: 'Dismiss the open menu or overlay, confirm it closed, then retry the intended control.' };
  }
  if (/ambiguous|multiple matching|accessible name/.test(text)) {
    return { category: 'Ambiguous control', recommendation: 'Replace the symbol or generic label with the control accessible name and its section or purpose.' };
  }
  if (log.action === 'upload_file' || /asset|file.*not found/.test(text)) {
    return { category: 'File upload', recommendation: 'Confirm the named project asset exists, then inspect the target page file input and the failure screenshot.' };
  }
  if (log.assertion_status === 'failed' || ['verify', 'verify_text'].includes(log.action) || /not found on page|assert|expected/.test(text)) {
    return { category: 'Verification', recommendation: 'Compare the expected outcome with the observed result. Confirm the preceding action and wait for the required page state; do not change the expectation merely to make the test pass.' };
  }
  if (log.action === 'goto' || /navigation|dns|net::|connection/.test(text)) {
    return { category: 'Navigation or network', recommendation: 'Check the target URL, connectivity, page load timing, and the captured HTTP failures below.' };
  }
  if (['click', 'fill', 'select'].includes(log.action) || /selector|locate|element/.test(text)) {
    return { category: 'Element resolution', recommendation: 'Inspect the failure screenshot and use the element visible label, role, placeholder, or a stable test ID.' };
  }
  return { category: 'Runtime', recommendation: 'Review the exact error and screenshot; reproduce the step once in headed mode to inspect the page state.' };
}

function networkRecommendation(group) {
  const status = Number(group.status || 0);
  const url = String(group.url || '');
  if (/generativelanguage\.googleapis\.com/i.test(url) && status === 404) {
    return 'Verify the configured Gemini model name and API endpoint; the requested model resource returned 404.';
  }
  if (/upload/i.test(url) && status >= 500) {
    return `Inspect the ${group.source || 'observed service'} upload endpoint logs, request payload, file-size limits, and server storage; the endpoint returned a server error.`;
  }
  if (status === 401 || status === 403) return 'Verify the target application session, token, and endpoint permissions.';
  if (status === 404) return 'Verify the endpoint path and deployed API version.';
  if (status >= 500) return `Inspect the ${group.source || 'observed service'} logs and dependency/database health for this endpoint.`;
  return 'Inspect connectivity, CORS, DNS, and the request failure details.';
}

function networkSource(projectUrl, requestUrl) {
  try {
    const requestHost = new URL(requestUrl).host.toLowerCase();
    const targetHost = projectUrl ? new URL(projectUrl).host.toLowerCase() : '';
    if (requestHost === targetHost) return 'Target application';
    if (/qa-testing-application-new.*\.onrender\.com$/.test(requestHost) || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestHost)) return 'QA-AI platform';
    return 'Third-party service';
  } catch (_) {
    return 'Unclassified observed service';
  }
}

export default function ProjectDetails({ projects = [], onDeleteProject, onSelectProject }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');

  const project = projects.find(p => String(p.id) === String(id)) || null;

  useEffect(() => {
    if (project && onSelectProject) onSelectProject(project);
  }, [project?.id]);

  // Execution State
  const [executing, setExecuting] = useState(false);
  const [executionId, setExecutionId] = useState(null);
  const [executionStatus, setExecutionStatus] = useState(null);
  const [executionLogs, setExecutionLogs] = useState([]);
  const [executionTotalSteps, setExecutionTotalSteps] = useState(0);
  const [headless, setHeadless] = useState(true);
  const [browserEngine, setBrowserEngine] = useState('Chromium');
  const [timeoutSec, setTimeoutSec] = useState(30);
  const [selectedScreenshot, setSelectedScreenshot] = useState(null);
  const pollingRef = useRef(null);
  const fileInputRef = useRef(null);
  const [translating, setTranslating] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [totalEstimatedTime, setTotalEstimatedTime] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [estimateLearning, setEstimateLearning] = useState(false);
  const [translationTime, setTranslationTime] = useState(0);
  const [translationStatusMsg, setTranslationStatusMsg] = useState('');
  const [resultsLogs, setResultsLogs] = useState([]);
  const [resultsStatus, setResultsStatus] = useState('');
  const [resultsError, setResultsError] = useState('');
  const [resultsId, setResultsId] = useState('');
  const [resultsDuration, setResultsDuration] = useState(0);
  const [resultsTelemetry, setResultsTelemetry] = useState([]);
  const [resultsBrowser, setResultsBrowser] = useState('Chromium');
  const [resultsDate, setResultsDate] = useState('');
  const [showReportView, setShowReportView] = useState(false); // keep placeholder to prevent syntax errors
  const [includeScreenshots, setIncludeScreenshots] = useState(true);
  const [finalDuration, setFinalDuration] = useState(0);
  const startTimeRef = useRef(null);

  // Test Cases State
  const [testCases, setTestCases] = useState([]);
  const [loadingTestCases, setLoadingTestCases] = useState(false);
  const [selectedTestCaseId, setSelectedTestCaseId] = useState('');
  const [editingTc, setEditingTc] = useState(null);
  const [tcSearch, setTcSearch] = useState('');

  // Upload Tab State
  const [uploadTcName, setUploadTcName] = useState('');
  const [uploadCommands, setUploadCommands] = useState('');
  const [uploadGroups, setUploadGroups] = useState(null);
  const [runVariables, setRunVariables] = useState({});
  useEffect(() => { setRunVariables({}); }, [id]);
  const [savingUpload, setSavingUpload] = useState(false);

  // Video State
  const [videoPath, setVideoPath] = useState(project?.video_file_path || '');
  const [faceVideoStoragePath, setFaceVideoStoragePath] = useState(project?.face_video_storage_path || '');
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoRestoring, setVideoRestoring] = useState(false);
  const [videoRestoreError, setVideoRestoreError] = useState('');

  // Assets State
  const [assets, setAssets] = useState([]);
  const [assetSearch, setAssetSearch] = useState('');
  const [assetUploading, setAssetUploading] = useState(false);

  // Execution History State
  const [execHistory, setExecHistory] = useState([]);
  const [historyFilter, setHistoryFilter] = useState('All');

  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    if (id) {
      TestCaseService.getTestCases(id).then(list => {
        setTestCases(list);
        if (list.length > 0 && !selectedTestCaseId) {
          setSelectedTestCaseId(list[0].id);
        }
      });
      AssetService.getAssets(id).then(setAssets);
      ExecutionService.getExecutionHistory(id).then(list => {
        setExecHistory(list);
        if (list.length > 0 && !resultsId) {
          const latest = list[0];
          ExecutionService.pollExecutionLogs(latest.id).then(res => {
            if (res) {
              setResultsLogs(res.logs || []);
              setResultsStatus(res.status);
              setResultsError(res.error_message || '');
              setResultsId(latest.id);
              setResultsDuration(res.duration_ms || 0);
              setResultsTelemetry(res.telemetry || []);
              setResultsDate(latest.created_at || '');
            }
          });
        }
      });
    }
  }, [id, activeTab]);

  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!id) return () => { cancelled = true; };
    ProjectService.listProjects().then(list => {
      if (cancelled) return;
      const refreshed = list.find(item => String(item.id) === String(id));
      if (refreshed?.video_file_path) setVideoPath(refreshed.video_file_path);
      if (refreshed?.face_video_storage_path) setFaceVideoStoragePath(refreshed.face_video_storage_path);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    if (project?.video_file_path) {
      setVideoPath(project.video_file_path);
      return () => { cancelled = true; };
    }
    if (!id || !faceVideoStoragePath || videoPath || videoRestoring) {
      return () => { cancelled = true; };
    }

    setVideoRestoring(true);
    setVideoRestoreError('');
    AssetService.restoreFaceVideo(faceVideoStoragePath, id)
      .then(async res => {
        if (cancelled || !res?.y4m_path) return;
        setVideoPath(res.y4m_path);
        await ProjectService.updateProject(id, {
          video_file_path: res.y4m_path,
          face_video_storage_path: faceVideoStoragePath
        });
      })
      .catch(error => {
        if (!cancelled) {
          console.warn('Face video could not be restored from cloud:', error.message);
          setVideoRestoreError(error.message);
        }
      })
      .finally(() => { if (!cancelled) setVideoRestoring(false); });

    return () => { cancelled = true; };
  }, [id, project?.video_file_path, faceVideoStoragePath]);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  useEffect(() => {
    if (!executing) return undefined;
    const interval = setInterval(() => {
      const elapsed = Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000));
      setElapsedSeconds(elapsed);
      setCountdown(Math.max(0, totalEstimatedTime - elapsed));
    }, 1000);
    return () => clearInterval(interval);
  }, [executing, totalEstimatedTime]);

  useEffect(() => {
    if (!executing || elapsedSeconds < 3) return;
    const completed = executionLogs.filter(log => !isSkippedLog(log)).length;
    const targetTc = testCases.find(tc => String(tc.id) === String(selectedTestCaseId)) || testCases[0];
    const expectedSteps = Math.max(1, (targetTc?.cached_json || []).length + 1);
    if (completed <= 0 || completed >= expectedSteps) return;
    const projected = Math.ceil(elapsedSeconds * expectedSteps / completed);
    if (projected > totalEstimatedTime) {
      setTotalEstimatedTime(previous => Math.max(previous, Math.round(previous * 0.7 + projected * 0.3)));
    }
  }, [executing, elapsedSeconds, executionLogs.length, selectedTestCaseId]);

  const handleLaunchExecution = async () => {
    if (!project) return;
    const targetTc = testCases.find(tc => String(tc.id) === String(selectedTestCaseId)) || testCases[0];
    
    const comparableRuns = execHistory
      .filter(run => String(run.test_id || '') === String(targetTc?.id || '') && ['Passed', 'Failed'].includes(run.status) && Number(run.duration_ms) > 0)
      .slice(0, 10)
      .map(run => Math.round(Number(run.duration_ms) / 1000))
      .sort((a, b) => a - b);
    const historyMedian = comparableRuns.length
      ? comparableRuns[Math.floor(comparableRuns.length / 2)]
      : 0;
    const explicitWaitSeconds = (targetTc?.cached_json || []).reduce((sum, step) =>
      String(step.action).toLowerCase() === 'wait' ? sum + Math.round(Number(step.value || 0) / 1000) : sum, 0);
    const structuralEstimate = Math.max(15, explicitWaitSeconds + Math.max(1, (targetTc?.cached_json || []).length) * 2);
    const avgDuration = historyMedian || structuralEstimate;

    setTotalEstimatedTime(avgDuration);
    setCountdown(avgDuration);
    setElapsedSeconds(0);
    setEstimateLearning(comparableRuns.length === 0);
    setFinalDuration(0);
    const commandStepCount = targetTc?.commands?.split('\n').filter(line => line.trim()).length || 0;
    const configuredStepCount = Math.max(commandStepCount, (targetTc?.cached_json || []).length, 1);
    setExecutionTotalSteps(configuredStepCount);
    startTimeRef.current = Date.now();

    setExecuting(true);
    setExecutionLogs([]);
    setExecutionStatus('Running');
    setResultsLogs([]);
    setResultsStatus('Running');
    setResultsError('');
    setResultsId('');
    setActiveTab('liverun');
    try {
      await AssetService.prepareAssetsForExecution(project.id);
      let executionVideoPath = project.video_file_path || videoPath;
      if (project.face_auth_enabled && !executionVideoPath && faceVideoStoragePath) {
        setVideoRestoring(true);
        setVideoRestoreError('');
        try {
          const restored = await AssetService.restoreFaceVideo(faceVideoStoragePath, project.id);
          executionVideoPath = restored?.y4m_path || '';
          if (!executionVideoPath) throw new Error('The local engine did not return a converted face-video path');
          setVideoPath(executionVideoPath);
          await ProjectService.updateProject(project.id, {
            video_file_path: executionVideoPath,
            face_video_storage_path: faceVideoStoragePath
          });
        } catch (error) {
          setVideoRestoreError(error.message);
          throw new Error(`Face video could not be restored on this computer: ${error.message}`);
        } finally {
          setVideoRestoring(false);
        }
      }
      let stepsToRun = targetTc?.cached_json || [];
      if (stepsToRun.length === 0 && targetTc?.commands) {
        const parsed = await AIService.translatePrompt(targetTc.commands);
        if (parsed.requires_review && !window.confirm('Review AI steps before execution:\n' + JSON.stringify(parsed.steps, null, 2))) throw new Error('Review cancelled');
        stepsToRun = parsed?.steps || [];
      }
      const validation = await AIService.validateSteps(stepsToRun);
      if (validation.warnings?.some(w => w.startsWith('No expected')) && !window.confirm('This test has no outcome checks. Continue with action-only execution?')) throw new Error('Run cancelled before execution');
      const res = await ExecutionService.triggerExecution({
        project_id: project.id,
        test_id: targetTc?.id,
        user_id: project.user_id,
        app_url: project.app_url,
        steps: stepsToRun.length > 0 ? stepsToRun : [
          { action: 'goto', target: project.app_url, value: '', raw_command: `Navigate to ${project.app_url}` }
        ],
        commands: targetTc?.commands || '',
        structured: targetTc?.type === 'structured',
        variables: runVariables,
        expected_step_count: configuredStepCount,
        face_auth_enabled: project.face_auth_enabled,
        y4m_path: executionVideoPath,
        headless,
        timeout_seconds: Number(timeoutSec)
      });
      if (res?.execution_id) {
        setExecutionId(res.execution_id);
        setExecutionTotalSteps(Number(res.total_steps) || configuredStepCount);
        startPollingLogs(res.execution_id);
      }
    } catch (err) {
      alert('Local daemon execution failed: ' + err.message);
      setExecuting(false);
      setExecutionStatus('Failed');
      setResultsStatus('Failed');
      setResultsError(err.message);
      setFinalDuration(Math.round((Date.now() - startTimeRef.current) / 1000));
    }
  };

  const handleStopRun = async () => {
    try {
      if (executionId) {
        await ExecutionService.stopExecution(executionId);
      }
    } catch (err) {
      console.error("Failed to stop execution:", err);
    }
    setExecuting(false);
    setExecutionStatus('Stopped');
    setResultsStatus('Stopped');
    setFinalDuration(Math.round((Date.now() - startTimeRef.current) / 1000));
  };

  const handleDownloadPdfDirect = () => {
    const element = document.querySelector('.report-card');
    if (!element) return;
    const opt = {
      margin:       0.2,
      filename:     `automation-test-report-${resultsId?.slice(0,6) || 'run'}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
  };

  const handleExportCsv = () => {
    const targetLogs = resultsLogs.length > 0 ? resultsLogs : executionLogs;
    if (targetLogs.length === 0) {
      alert("No execution logs available to export.");
      return;
    }
    const headers = ["Step", "Action", "Target", "Value", "Status", "Action Completed", "Assertion Status", "Expected Type", "Expected Value", "Observed", "Failure Reason"];
    const rows = [];
    targetLogs.forEach((log, idx) => {
      let actionName = log.action;
      if (idx === 0 && log.action === 'goto') {
        actionName = "Browser Launch / Network Init";
      }
      rows.push([
        idx + 1,
        actionName,
        log.target || "",
        log.value || "",
        log.status?.toUpperCase() || "UNKNOWN",
        log.action_completed === true ? 'true' : 'false',
        log.assertion_status || 'not_requested',
        log.expected_type || '',
        log.expected_value || '',
        log.observed || '',
        log.error_message || ''
      ]);
    });
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Test_Results_Run_${resultsId?.slice(0, 4) || 'run'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleViewHistoryRun = async (runId, execMeta) => {
    try {
      const res = await ExecutionService.pollExecutionLogs(runId);
      if (res) {
        setResultsLogs(res.logs || []);
        setResultsStatus(res.status);
        setResultsError(res.error_message || '');
        setResultsId(runId);
        setResultsDuration(res.duration_ms || 0);
        setResultsTelemetry(res.telemetry || []);
        setResultsBrowser('Chromium');
        setResultsDate(execMeta.created_at || new Date().toISOString());
        setActiveTab('results');
      }
    } catch (err) {
      alert("Failed to fetch historical run details: " + err.message);
    }
  };

  const startPollingLogs = (execId) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const res = await ExecutionService.pollExecutionLogs(execId);
        if (res) {
          setExecutionLogs(res.logs || []);
          if (Number(res.total_steps) > 0) setExecutionTotalSteps(Number(res.total_steps));
          setExecutionStatus(res.status);
          if (['Passed', 'Failed', 'Stopped'].includes(res.status)) {
            clearInterval(pollingRef.current);
            setExecuting(false);
            setResultsLogs(res.logs || []);
            setResultsStatus(res.status);
            setResultsError(res.error_message || '');
            setResultsId(execId);
            setResultsDuration(res.duration_ms || 0);
            setResultsTelemetry(res.telemetry || []);
            setResultsDate(new Date().toISOString());
            setFinalDuration(res.duration_ms ? Math.round(res.duration_ms / 1000) : Math.round((Date.now() - startTimeRef.current) / 1000));
            ExecutionService.getExecutionHistory(id).then(setExecHistory);
            const completedTc = testCases.find(tc => String(tc.id) === String(selectedTestCaseId));
            ExecutionService.syncCompletedExecution(execId, id, completedTc?.id, res)
              .catch(error => console.warn('Cloud execution sync pending:', error.message));
          }
        }
      } catch (err) { console.error('Polling error:', err); }
    }, 1500);
  };

  const handleSaveUploadTc = async (e) => {
    e.preventDefault();
    if (!uploadTcName.trim() || (!uploadGroups && !uploadCommands.trim())) return;
    setSavingUpload(true);
    try {
      let groups = uploadGroups;
      if (!groups) {
        const parsed = await AIService.translatePrompt(uploadCommands);
        if (parsed.requires_review && !window.confirm('Review AI-generated steps before saving:\n' + JSON.stringify(parsed.steps, null, 2))) return;
        groups = [{ name: uploadTcName, steps: parsed.steps }];
      }
      const checked = [];
      for (const group of groups) {
        const validation = await AIService.validateSteps(group.steps);
        checked.push({...group, steps: validation.steps, warnings: validation.warnings});
      }
      const warnings = checked.flatMap(g => g.warnings || []);
      if (warnings.length && !window.confirm(warnings.join('\n') + '\nSave this test definition?')) return;
      for (const group of checked) {
        const newTc = await TestCaseService.createTestCase({
          project_id: id, name: group.name, commands: describeSteps(group.steps),
          cached_json: group.steps, type: 'structured', status: 'ready'
        });
        setTestCases(prev => [newTc, ...prev]);
        setSelectedTestCaseId(newTc.id);
      }
      setUploadTcName('');
      setUploadCommands('');
      setUploadGroups(null);
      setActiveTab('testcases');
    } catch (err) {
      alert('Failed to import test case: ' + err.message);
    } finally {
      setSavingUpload(false);
    }
  };

  const handleSaveEditModal = async () => {
    if (!editingTc) return;
    try {
      const original = testCases.find(tc => tc.id === editingTc.id);
      const parsed = editingTc.type === 'structured' || original?.commands === editingTc.commands
        ? await AIService.validateSteps(editingTc.cached_json)
        : await AIService.translatePrompt(editingTc.commands);
      if (parsed.requires_review && !window.confirm('Review AI steps:\n' + JSON.stringify(parsed.steps, null, 2))) return;
      await TestCaseService.updateTestCase(editingTc.id, {
        name: editingTc.name,
        commands: editingTc.commands,
        cached_json: parsed?.steps || editingTc.cached_json
      });
      setTestCases(prev => prev.map(tc => tc.id === editingTc.id ? { ...tc, ...editingTc, cached_json: parsed?.steps } : tc));
      setEditingTc(null);
    } catch (err) {
      alert('Failed to update test case: ' + err.message);
    }
  };

  const handleDeleteTc = async (tcId) => {
    if (!window.confirm('Delete this test case?')) return;
    await TestCaseService.deleteTestCase(tcId);
    setTestCases(prev => prev.filter(tc => tc.id !== tcId));
  };

  const handleVideoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setVideoUploading(true);
    try {
      const res = await AssetService.uploadFaceVideo(file, id);
      if (res?.y4m_path) {
        setVideoPath(res.y4m_path);
        setFaceVideoStoragePath(res.storage_path);
        await ProjectService.updateProject(id, {
          video_file_path: res.y4m_path,
          face_video_storage_path: res.storage_path
        });
      }
    } catch (err) { alert('Video upload failed: ' + err.message); }
    finally { setVideoUploading(false); }
  };

  const handleAssetUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAssetUploading(true);
    try {
      const res = await AssetService.uploadAsset(file, id);
      setAssets(prev => [res, ...prev]);
    } catch (err) { alert('Asset upload failed: ' + err.message); }
    finally { setAssetUploading(false); }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      handleFileImport(file);
    }
  };

  const handleFileImport = (file) => {
    const fileExt = file.name.split('.').pop().toLowerCase();
    if (fileExt === 'xlsx') {
      alert("XLSX import requires Excel parser. Please convert/save your file as CSV and drag it here to translate.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      if (fileExt === 'csv') {
        try {
          const groups = parseTestCsv(content, file.name.replace(/\.csv$/i, ''));
          setUploadGroups(groups);
          setUploadCommands(groups.map(g => describeSteps(g.steps)).join('\n'));
        } catch (error) { alert(error.message); return; }
      } else {
        setUploadGroups(null);
        setUploadCommands(content);
      }
      const fileNameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      setUploadTcName(fileNameWithoutExt);
    };
    reader.readAsText(file);
  };

  const handleDeleteProject = async () => {
    await ProjectService.deleteProject(id);
    onDeleteProject(id);
    navigate('/');
    setShowDeleteModal(false);
  };

  if (!project) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-600 dark:text-slate-400 text-xs">Project not found.</p>
          <button onClick={() => navigate('/')} className="mt-4 text-xs text-indigo-400 hover:underline">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const selectedTc = testCases.find(tc => String(tc.id) === String(selectedTestCaseId)) || testCases[0];
  const totalRuns = execHistory.length;
  const passed    = execHistory.filter(e => e.status === 'Passed' || e.status === 'passed').length;
  const rate      = totalRuns > 0 ? Math.round((passed / totalRuns) * 100) : 0;

  const configuredTotalSteps = Math.max(
    selectedTc?.commands?.split('\n').filter(line => line.trim()).length || 0,
    selectedTc?.cached_json?.length || 0,
    1
  );
  const totalSteps = executionTotalSteps || configuredTotalSteps;
  const finishedSteps = executionLogs.filter(l => ['passed', 'failed', 'skipped'].includes(String(l.status).toLowerCase())).length;
  const pendingSteps = Math.max(0, totalSteps - finishedSteps);
  const passedSteps = executionLogs.filter(l => l.status === 'passed').length;
  const failedSteps = executionLogs.filter(l => l.status === 'failed').length;
  const hasFailures = executionStatus === 'Failed' || executionLogs.some(isFailedLog);
  const isFinalizing = executing && totalSteps > 0 && executionLogs.length >= totalSteps;

  return (
    <div className="space-y-6">

      {/* Project Header */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-zinc-800 bg-gradient-to-br from-slate-900 to-slate-800 dark:from-zinc-900 dark:to-[#0c0c0e] p-7">
        <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-600/15 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute bottom-0 right-20 w-40 h-40 bg-violet-600/10 rounded-full blur-[60px] pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-5">
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="badge badge-indigo" title={`Full project ID: ${project.id}`}>Project #{String(project.id).slice(0, 8)}</span>
              <span className="text-slate-600 dark:text-slate-400 text-xs font-medium">{project.app_name || project.name}</span>
              <span className="badge badge-indigo">🔐 Username &amp; Password{project.face_auth_enabled ? ' + 📷 Face Auth Enabled' : ''}</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight leading-snug">{project.name}</h1>
            <a href={project.app_url} target="_blank" rel="noreferrer"
               className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors font-mono font-medium">
              <Globe size={13}/>{project.app_url}
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setActiveTab('upload')} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors">
              <Upload size={13}/> Import Test
            </button>
            <button onClick={() => setActiveTab('runsuite')} className="btn-primary text-xs px-4 py-2">
              <Play size={13}/> Run Suite
            </button>
            <button onClick={() => setShowDeleteModal(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold transition-all">
              <Trash2 size={13}/> Delete Project
            </button>
          </div>
        </div>
        <div className="relative z-10 mt-6 pt-5 border-t border-white/10 grid grid-cols-3 gap-4 max-w-sm">
          {[{label:'Success Rate',value:`${rate}%`},{label:'Test Cases',value:testCases.length},{label:'Total Runs',value:totalRuns}].map(s => (
            <div key={s.label}>
              <p className="text-[10px] text-slate-600 dark:text-slate-400 uppercase font-semibold tracking-wider">{s.label}</p>
              <p className="text-lg font-black text-white mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-100 dark:border-zinc-800 overflow-x-auto scrollbar-thin">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-indigo-500 text-slate-900 dark:text-zinc-100'
                : 'border-transparent text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 hover:border-slate-300 dark:hover:border-zinc-700'
            }`}>
            {tab.label}
          </button>
        ))}
        {executing && (
          <button onClick={() => setActiveTab('liverun')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'liverun' ? 'border-emerald-500 text-emerald-500' : 'border-transparent text-emerald-500/80'
            }`}>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Live Run
          </button>
        )}
      </div>

      {/* Tab Contents */}
      <div>

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-5">
              <div className="card p-5 space-y-3">
                <h2 className="section-label">Project Description</h2>
                <p className="text-secondary text-sm leading-relaxed">{project.description || 'No description added.'}</p>
              </div>

              <div className="card p-5 space-y-4 border border-indigo-500/20 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                      <span>🔐 Authentication Configuration</span>
                    </h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400">Configure optional Face Verification &amp; virtual media stream for this project.</p>
                  </div>
                  <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${
                    project.face_auth_enabled ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300'
                  }`}>
                    {project.face_auth_enabled ? <ToggleRight size={16}/> : <ToggleLeft size={16}/>}
                    {project.face_auth_enabled ? 'Face Auth Enabled' : 'Face Auth Disabled'}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                  <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700">
                    <p className="font-bold text-indigo-400 mb-1">☑ Username / Email &amp; Password Login</p>
                    <p className="text-[11px] text-slate-400">Provided directly inside your test case commands (e.g. <code className="text-amber-300 font-mono">fill Email...</code>, <code className="text-amber-300 font-mono">fill Password...</code>).</p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700">
                    <p className="font-bold text-indigo-400 mb-1">☑ Biometric Face Verification (Optional)</p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">Automated virtual webcam input stream for 2-Factor Face Auth logins.</p>
                  </div>
                </div>
                {project.face_auth_enabled && (
                  <div className="p-4 rounded-xl border border-indigo-500/30 bg-slate-950/60 space-y-3">
                    <p className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                      <Activity size={13}/> Virtual Webcam Biometric Input Video (.mp4)
                    </p>
                    {(project.video_file_path || videoPath) ? (
                      <div className="space-y-3">
                        <video controls muted preload="metadata" crossOrigin="anonymous"
                          src={localAssetUrl(`/api/videos/${(videoPath || project.video_file_path).split(/[\/\\]/).pop().replace('.y4m', '.mp4')}`)}
                          className="w-full max-h-48 rounded-lg border border-slate-800 bg-black" />
                        <div className="flex gap-2">
                          <label className="flex-1 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold text-center cursor-pointer transition-colors flex items-center justify-center gap-1.5">
                            <Upload size={12}/> Replace Video
                            <input type="file" accept="video/mp4" onChange={handleVideoUpload} className="hidden" />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <label className="border-2 border-dashed border-indigo-500/40 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer hover:bg-indigo-950/30 transition-all">
                        <Upload size={22} className="text-indigo-400 mb-1.5"/>
                        <span className="text-xs font-bold text-indigo-200">Upload Face Verification Test Video</span>
                        <span className="text-[10px] text-slate-400 mt-0.5">Supported Format: MP4</span>
                        {(videoUploading || videoRestoring) && <span className="text-xs text-indigo-400 font-bold mt-2 animate-pulse">{videoRestoring ? 'Restoring encrypted face video from cloud...' : 'Uploading face video locally and to cloud...'}</span>}
                        <input type="file" accept="video/mp4" onChange={handleVideoUpload} className="hidden" />
                      </label>
                    )}
                    {videoRestoreError && (
                      <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-300">
                        <span>Cloud video restore failed: {videoRestoreError}</span>
                        <button type="button" onClick={() => { setVideoRestoreError(''); setVideoPath(''); }} className="font-bold underline">Retry</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="card p-5 space-y-4">
                <h2 className="section-label">Quality Metrics</h2>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    {label:'Success Rate',    value:`${rate}%`,         color:'text-emerald-600 dark:text-emerald-400'},
                    {label:'Test Scenarios',  value:testCases.length,    color:'text-indigo-600 dark:text-indigo-400'},
                    {label:'Total Executions',value:totalRuns,           color:'text-violet-600 dark:text-violet-400'},
                  ].map(m => (
                    <div key={m.label} className="bg-slate-50 dark:bg-zinc-800/50 rounded-xl p-4 border border-slate-100 dark:border-zinc-800">
                      <p className="section-label">{m.label}</p>
                      <p className={`text-2xl font-black mt-1 ${m.color}`}>{m.value}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-muted mb-1.5">
                    <span>Overall pass rate</span>
                    <span className="text-primary font-semibold">{rate}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full gradient-brand rounded-full" style={{width:`${rate}%`}}/>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="card p-5 space-y-4">
                <h2 className="section-label">Latest Execution</h2>
                {execHistory.length > 0 ? (
                  <>
                    <div className="space-y-2.5 text-xs">
                      {[
                        {label:'Run ID',   value:`#${execHistory[0].id?.slice(0,4) || execHistory[0].id}`, mono:true},
                        {label:'Status',   badge:true, value:execHistory[0].status, ok:execHistory[0].status === 'Passed' || execHistory[0].status === 'passed'},
                        {label:'Duration', value:`${(execHistory[0].duration_ms / 1000).toFixed(0)}s`},
                        {label:'Date',     value:new Date(execHistory[0].created_at || Date.now()).toLocaleDateString()},
                      ].map(r => (
                        <div key={r.label} className="flex justify-between items-center">
                          <span className="text-secondary">{r.label}</span>
                          {r.badge
                            ? <span className={`badge ${r.ok ? 'badge-success' : 'badge-error'}`}>{r.ok ? <CheckCircle2 size={10}/> : <XCircle size={10}/>} {r.value}</span>
                            : <span className={`font-semibold text-primary ${r.mono?'font-mono':''}`}>{r.value}</span>}
                        </div>
                      ))}
                    </div>
                    <button onClick={() => setActiveTab('results')}
                      className="w-full py-2 rounded-lg text-xs font-bold text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-500/5 hover:bg-indigo-100 dark:hover:bg-indigo-500/10 transition-colors">
                      View full results
                    </button>
                  </>
                ) : <p className="text-xs text-muted text-center py-4">No runs yet</p>}
              </div>

              <div className="card p-5 space-y-3">
                <h2 className="section-label">Quick Actions</h2>
                {[
                  {label:'Import test case',icon:Upload,  tab:'upload'},
                  {label:'Run suite',       icon:Play,    tab:'runsuite'},
                  {label:'View history',    icon:Clock,   tab:'history'}
                ].map(a => (
                  <button key={a.tab} onClick={() => setActiveTab(a.tab)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-secondary hover:text-primary text-xs font-semibold transition-colors text-left">
                    <a.icon size={13}/> {a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TEST CASES */}
        {activeTab === 'testcases' && (
          <div className="space-y-4">
            <div className="flex gap-3 items-center">
              <div className="flex-1 flex items-center gap-2 card !rounded-xl px-3 py-2 hover:border-slate-300 dark:hover:border-zinc-700 transition-colors">
                <Search size={15} className="text-muted flex-shrink-0"/>
                <input type="text" value={tcSearch} onChange={e => setTcSearch(e.target.value)}
                  placeholder="Search test cases..." className="bg-transparent text-xs text-primary placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-none w-full"/>
              </div>
              <button onClick={() => setActiveTab('upload')} className="btn-primary text-xs px-3 py-2">
                <PlusCircle size={13}/> Add Test
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {testCases.filter(t => t.name.toLowerCase().includes(tcSearch.toLowerCase())).map(t => (
                <div key={t.id} className="card card-hover p-5 flex flex-col gap-4 group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="badge badge-indigo text-[10px]">{(t.type || 'CSV').toUpperCase()}</span>
                        <span className="text-[10px] text-muted font-mono">#{t.id?.slice(0,4) || t.id}</span>
                      </div>
                      <h3 className="font-bold text-sm text-primary group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{t.name}</h3>
                    </div>
                    <button onClick={() => handleDeleteTc(t.id)}
                      className="text-muted hover:text-red-500 dark:hover:text-red-400 transition-colors p-1 flex-shrink-0">
                      <Trash2 size={14}/>
                    </button>
                  </div>
                  <div className="bg-slate-100 dark:bg-zinc-950 rounded-lg p-3 font-mono text-[11px] text-secondary border border-slate-200 dark:border-zinc-900 overflow-hidden">
                    <div className="truncate">$ {(t.commands || '').split('\n')[0] || 'No commands defined'}</div>
                    {(t.commands || '').split('\n').length > 1 && <div className="text-muted mt-1">+{(t.commands || '').split('\n').length-1} more steps</div>}
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-zinc-900">
                    <button onClick={() => setEditingTc({...t})}
                      className="btn-ghost flex-1 justify-center text-xs !px-2 !py-1.5"><Edit3 size={12}/> Edit</button>
                    <button onClick={() => { setSelectedTestCaseId(t.id); setActiveTab('runsuite'); }}
                      className="btn-primary flex-1 justify-center text-xs !px-2 !py-1.5"><Play size={12}/> Run</button>
                  </div>
                </div>
              ))}
              {testCases.length === 0 && (
                <div className="col-span-full card p-12 text-center">
                  <FileText size={32} className="text-muted mx-auto mb-3"/>
                  <p className="text-secondary text-sm">No test cases yet.</p>
                  <button onClick={() => setActiveTab('upload')} className="btn-primary mt-4 mx-auto"><Upload size={14}/> Import Test Case</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PROJECT ASSETS */}
        {activeTab === 'assets' && (
          <div className="w-full space-y-6">
            <div className="card p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 dark:bg-zinc-900/60 border border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <Paperclip size={20} className="text-indigo-400" />
                  <h2 className="text-lg font-black text-primary tracking-tight">Project Assets</h2>
                  <span className="badge badge-indigo text-xs">{assets.length} Assets</span>
                </div>
                <p className="text-xs text-secondary mt-1">
                  Upload reusable test files (documents, images, spreadsheets, videos) for automated <code className="text-amber-400 font-mono">upload_file</code> Playwright steps.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex items-center min-w-[220px]">
                  <Search size={14} className="absolute left-3 text-muted pointer-events-none"/>
                  <input type="text" value={assetSearch} onChange={e => setAssetSearch(e.target.value)}
                    placeholder="Search assets..." className="input-field input-field-icon text-xs py-2" />
                </div>
                <label className="btn-primary text-xs px-4 py-2 flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-500/20">
                  <Plus size={15}/> Upload Assets
                  <input type="file" multiple onChange={handleAssetUpload} className="hidden" />
                </label>
              </div>
            </div>

            <div className="card overflow-hidden border border-slate-800 shadow-xl">
              <div className="p-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-950/40">
                <h3 className="section-label">Uploaded Project Test Files</h3>
                {assetUploading && (
                  <div className="flex items-center gap-2 text-xs text-indigo-400 font-semibold animate-pulse">
                    <RefreshCw size={14} className="animate-spin" /> Uploading asset...
                  </div>
                )}
              </div>

              {assets.length === 0 ? (
                <div className="p-12 text-center text-xs text-muted space-y-3">
                  <Paperclip size={32} className="mx-auto text-slate-600 dark:text-zinc-700" />
                  <p className="font-bold text-slate-300">No Project Assets Uploaded Yet</p>
                  <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                    Click <strong>"Upload Assets"</strong> above to upload reusable test files like <code className="text-amber-400 font-mono">resume.pdf</code>, <code className="text-amber-400 font-mono">profile.jpg</code>.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-sans border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/80 text-muted uppercase text-[10px] font-bold tracking-wider">
                        <th className="py-3 px-4">Asset Details</th>
                        <th className="py-3 px-4">Filename</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-900">
                      {assets.filter(a => (a.filename || a.name || '').toLowerCase().includes(assetSearch.toLowerCase())).map((asset, idx) => (
                        <tr key={asset.id || idx} className="hover:bg-slate-50 dark:hover:bg-zinc-800/30 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                <Paperclip size={18}/>
                              </div>
                              <div>
                                <p className="font-bold text-primary text-xs">{asset.filename || asset.asset_name || asset.name}</p>
                                <p className="text-[10px] text-muted font-mono">ID: #{asset.id?.slice(0,4) || asset.id}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-400 text-xs">{asset.filename || asset.original_filename || asset.name}</td>
                          <td className="py-3.5 px-4">
                            <span className="badge badge-indigo text-[10px]">{(asset.file_type || asset.type || 'file').toUpperCase()}</span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => AssetService.deleteAsset(asset.id).then(() => setAssets(prev => prev.filter((_, i) => i !== idx)))}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-400 transition-colors"
                              >
                                <Trash2 size={13}/>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'runsuite' && <WorkspaceTools project={{...project,id,project_type:'web'}} disabled={executing}/> }
        {activeTab === 'runsuite' && variableNames(selectedTc?.cached_json || []).length > 0 && <div className="card p-4 space-y-2"><h3 className="text-primary">Runtime test data (not saved in the test)</h3>{variableNames(selectedTc?.cached_json || []).map(name => <label key={name} className="block text-sm text-secondary">{name}<input type="password" autoComplete="off" className="input-field" value={runVariables[name] || ''} onChange={e => setRunVariables({...runVariables, [name]: e.target.value})}/></label>)}</div>}
        {/* UPLOAD */}
        {activeTab === 'upload' && <DraftTools project={{...project,id,project_type:'web'}} disabled={executing} onDraft={steps=>{setUploadGroups([{name:'Captured workflow',steps}]);setUploadTcName('Captured workflow');setUploadCommands(describeSteps(steps));}}/>}
        {activeTab === 'upload' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-6xl">
            <div className="lg:col-span-7 space-y-6">
              <div className="card p-4 text-sm text-secondary">Use one scenario per test case. CSV: Test Case, Step, Action, Target, Value, Expected Type, Expected Value. Legacy Value/Exp remains supported. CSV wait values are seconds. Add explicit checks for business outcomes; a completed click alone is not proof of success. Hardware/MQTT/API actions are not supported. Store credentials as runtime variables such as {'{{test_password}}'} rather than in shared CSV files.</div>
              <form onSubmit={handleSaveUploadTc} className="card p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4">
                  <h3 className="text-base font-bold text-primary">Import &amp; Create Test Case</h3>
                  <button type="button"
                    onClick={() => {
                      const csv = SAMPLE_CSV;
                      const a = document.createElement('a');
                      a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
                      a.download = 'sample_test_case.csv';
                      a.click();
                    }}
                    className="btn-ghost text-xs !px-3 !py-1.5"
                  >
                    <Download size={13}/> Download Sample CSV
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="section-label">Test Case Name</label>
                  <input type="text" required placeholder="e.g. Login Happy Path"
                    value={uploadTcName} onChange={e => {setUploadTcName(e.target.value); if (uploadGroups?.length === 1) setUploadGroups([{...uploadGroups[0], name: e.target.value}]);}}
                    className="input-field" />
                </div>

                <div className="space-y-1.5">
                  {uploadGroups ? uploadGroups.map((group, i) => <div key={i}><p className="text-primary text-sm">{group.name}</p><TestStepBuilder steps={group.steps} onChange={steps => { const next = uploadGroups.map((g, n) => n === i ? {...g, steps} : g); setUploadGroups(next); setUploadCommands(next.map(g => describeSteps(g.steps)).join('\n')); }}/></div>) : <textarea rows={6} value={uploadCommands} onChange={e => setUploadCommands(e.target.value)}
                    className="input-field resize-none font-mono text-xs"
                    placeholder={"goto https://example.com/login\nfill Email with test@example.com\nfill Password with TEST_PASSWORD\nclick Sign In\nverify Overview"} />}
                  <button type="button" className="btn-ghost text-xs" onClick={() => { if (uploadCommands && !window.confirm('Replace this draft with an empty structured test?')) return; setUploadGroups([{name: uploadTcName || 'New test', steps: []}]); setUploadCommands(''); }}>New guided test</button>
                  {uploadGroups && <button type="button" className="btn-ghost text-xs" onClick={() => { if (window.confirm('Discard structured fields and start a new plain-English draft?')) {setUploadGroups(null); setUploadCommands('');} }}>New plain-English test</button>}
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".txt,.csv"
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file) handleFileImport(file);
                  }}
                  className="border-2 border-dashed border-indigo-500/30 hover:border-indigo-400 rounded-xl p-8 text-center cursor-pointer transition-colors bg-indigo-950/5"
                >
                  <Upload size={28} className="text-indigo-400 mx-auto mb-2" />
                  <p className="text-xs text-secondary font-semibold">Drop TXT or CSV here (save Excel files as CSV first)</p>
                </div>

                <div className="pt-2 flex justify-end">
                  <button type="submit" disabled={savingUpload} className="btn-primary">
                    {savingUpload ? 'Parsing & Saving...' : 'Save Test Case'}
                  </button>
                </div>
              </form>
            </div>

            <div className="lg:col-span-5 space-y-6">
              <div className="card p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet size={16} className="text-indigo-400" />
                    <h4 className="section-label">CSV Upload Specification</h4>
                  </div>
                  <span className="badge badge-indigo text-[10px]">Structured CSV</span>
                </div>
                <p className="text-xs text-secondary leading-relaxed">Download the sample for the complete format. Required columns: Action, Target. Add Step, Value and expected outcome columns for meaningful functional checks.</p>
                <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 font-mono text-[11px]">
                  <div className="grid grid-cols-4 p-2.5 bg-slate-100 dark:bg-zinc-900 text-muted font-bold border-b border-slate-200 dark:border-zinc-800">
                    <span>Step</span><span>Action</span><span>Target</span><span>Value</span>
                  </div>
                  {[
                    ['1','goto','https://example.com','-'],
                    ['2','fill','Email address','{{test_email}}'],
                    ['3','click','Sign In','-'],
                  ].map(([s,a,t,v]) => (
                    <div key={s} className="grid grid-cols-4 gap-2 p-2.5 break-all text-secondary border-b border-slate-100 dark:border-zinc-900 last:border-0">
                      <span className="text-muted">{s}</span>
                      <span className="text-emerald-600 dark:text-emerald-400">{a}</span>
                      <span>{t}</span>
                      <span className="text-amber-600 dark:text-amber-400">{v}</span>
                    </div>
                  ))}
                </div>

                <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-500/20 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                    <Sparkles size={13} className="text-indigo-500" /> Validated before execution
                  </div>
                  <p className="text-[11px] text-secondary leading-relaxed">
                    CSV and guided steps run directly, without AI conversion. Supported plain-text commands use deterministic parsing; unfamiliar commands require an explicit AI review. URLs must include http:// or https://. CSV wait values are seconds.
                  </p>
                  <p className="text-xs text-secondary leading-relaxed">Use Expected Type = text_visible and Expected Value = Welcome after Sign In. A successful click alone does not verify login. Keep credentials in runtime variables, not shared CSV files.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* RUN SUITE */}
        {activeTab === 'runsuite' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-6xl">
            <div className="lg:col-span-6 space-y-6">
              <div className="card p-6 space-y-5">
                <div className="space-y-1.5">
                  <label className="section-label">Select Test Case</label>
                  <select value={selectedTestCaseId} onChange={e => setSelectedTestCaseId(e.target.value)}
                    className="input-field">
                    {testCases.map(tc => <option key={tc.id} value={tc.id}>{tc.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="section-label">Browser Engine</label>
                    <select value={browserEngine} onChange={e => setBrowserEngine(e.target.value)} className="input-field">
                      <option>Chromium</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="section-label">Timeout (seconds)</label>
                    <input type="number" value={timeoutSec} onChange={e => setTimeoutSec(e.target.value)} className="input-field" />
                  </div>
                </div>
                <div className="flex items-center justify-between py-3 border-t border-slate-100 dark:border-zinc-800">
                  <div>
                    <p className="text-xs font-semibold text-primary">Headless Mode</p>
                    <p className="text-[11px] text-secondary mt-0.5">Run browser without a visible GUI window</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={headless} onChange={e => setHeadless(e.target.checked)} className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-200 dark:bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
                <button onClick={handleLaunchExecution} disabled={executing}
                  className="btn-primary w-full justify-center py-3">
                  <Play size={16}/> {executing ? 'Running...' : 'Launch Playwright Execution'}
                </button>
              </div>
            </div>

            <div className="lg:col-span-6 space-y-6">
              <div className="card p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Activity size={16} className="text-indigo-400" />
                    <h4 className="section-label">Pre-Flight Verification</h4>
                  </div>
                  <span className="badge badge-indigo text-[10px]">Validated on launch</span>
                </div>
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between"><span className="text-secondary">Target URL:</span><span className="text-indigo-600 dark:text-indigo-400 truncate max-w-[200px]">{project.app_url}</span></div>
                  <div className="flex justify-between"><span className="text-secondary">Test Case:</span><span className="text-primary font-bold">{selectedTc?.name || 'Default'}</span></div>
                  <div className="flex justify-between"><span className="text-secondary">Steps:</span><span className="text-emerald-600 dark:text-emerald-400 font-bold">{selectedTc?.cached_json?.length || selectedTc?.commands?.split('\n').length || 1} steps</span></div>
                  <div className="flex justify-between"><span className="text-secondary">Face Auth:</span><span className="text-violet-600 dark:text-violet-400 font-bold">{project.face_auth_enabled ? '⚡ Active' : 'Disabled'}</span></div>
                </div>
                <div className="space-y-2">
                  <span className="section-label block">Execution Steps Preview</span>
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-900 font-mono text-[11px] text-secondary leading-relaxed max-h-48 overflow-y-auto scrollbar-thin">
                    {(selectedTc?.commands || `goto ${project.app_url}`).split('\n').map((line, idx) => (
                      <div key={idx}>#{idx + 1} {line}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* LIVE RUN */}
        {activeTab === 'liverun' && (
          <div className="space-y-6 max-w-7xl">
            <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={
                  executing
                    ? "w-3 h-3 rounded-full bg-emerald-400 animate-pulse flex-shrink-0"
                    : executionStatus === 'Stopped'
                      ? "w-3 h-3 rounded-full bg-amber-400 flex-shrink-0"
                      : hasFailures
                        ? "w-3 h-3 rounded-full bg-red-500 flex-shrink-0"
                        : "w-3 h-3 rounded-full bg-emerald-500 flex-shrink-0"
                } />
                <div>
                  <h3 className="text-sm font-bold text-primary">
                    {executing
                      ? isFinalizing ? "Finalizing Execution" : "Live Execution Running"
                      : executionStatus === 'Stopped'
                        ? "Live Execution Finished (Stopped)"
                        : hasFailures
                          ? "Live Execution Finished with Fails"
                          : "Live Execution Finished"
                    }
                  </h3>
                  <p className="text-xs text-secondary">
                    {executing
                      ? isFinalizing
                        ? "Closing the browser and saving final results, screenshots, and telemetry."
                        : "Playwright automating the target web application in real-time"
                      : executionStatus === 'Stopped'
                        ? "The test execution was stopped by user request."
                        : hasFailures
                          ? "The test execution completed but some assertions or steps failed."
                          : summarizeRun(executionLogs, executionStatus).displayStatus
                    }
                  </p>
                </div>
              </div>
              <button
                disabled={!executing}
                onClick={handleStopRun}
                className="px-4 py-2 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-950/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Stop Run
              </button>
            </div>

            <div className="grid grid-cols-4 gap-4">
              {/* Card 1: Total Steps */}
              <div className="card p-4">
                <p className="section-label">Total Steps</p>
                <p className="text-xl font-black mt-1 text-primary">{totalSteps} Steps</p>
                <p className="text-[10px] text-muted mt-1">Defined in test case</p>
              </div>

              {/* Card 2: Finished & Pending */}
              <div className="card p-4">
                <p className="section-label">Steps Status</p>
                <p className="text-xl font-black mt-1 text-primary">{finishedSteps} Finished</p>
                <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold mt-1">{pendingSteps} Pending</p>
              </div>

              {/* Card 3: Passed & Failed */}
              <div className="card p-4">
                <p className="section-label">Steps Audit</p>
                <p className="text-xl font-black mt-1 text-emerald-600 dark:text-emerald-400">{passedSteps} Passed</p>
                <p className={`text-[10px] font-semibold mt-1 ${failedSteps > 0 ? 'text-red-500' : 'text-muted'}`}>{failedSteps} Failed</p>
              </div>

              <div className="card p-4">
                <p className="section-label">Total Execution Time</p>
                {executing ? (
                  <>
                    <p className="text-xl font-black mt-1 text-primary">Elapsed: {formatTime(elapsedSeconds)}</p>
                    <p className="text-[10px] text-muted font-semibold mt-1">
                      {estimateLearning ? 'Initial estimate' : 'History-based estimate'}: {formatTime(totalEstimatedTime)}
                    </p>
                    <p className={`text-[10px] font-semibold mt-1 ${elapsedSeconds > totalEstimatedTime ? 'text-amber-500' : 'text-indigo-600 dark:text-indigo-400'}`}>
                      {elapsedSeconds > totalEstimatedTime
                        ? `Estimate exceeded by ${formatTime(elapsedSeconds - totalEstimatedTime)} · test is still running`
                        : `Estimated remaining: ${formatTime(countdown)}`}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xl font-black mt-1 text-primary">{formatTime(finalDuration || Math.round(resultsDuration / 1000))}</p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">Execution Finished</p>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-3">
                <span className="section-label block">Execution Steps Audit</span>
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin">
                  {executionLogs.map((log, i) => {
                    const isFailed = log.status === 'failed' || log.status === 'Failed';
                    const isSkipped = isSkippedLog(log);
                    return (
                      <div key={i} className={`card !rounded-xl p-3 flex items-center justify-between gap-3 min-w-0 text-xs font-mono border ${isFailed ? 'border-red-500/30 bg-red-500/5' : 'border-slate-200 dark:border-zinc-800'}`}>
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          {log.status === 'passed' && <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />}
                          {log.status === 'failed' && <XCircle size={16} className="text-red-500 flex-shrink-0" />}
                          {isSkipped && <AlertCircle size={16} className="text-amber-500 flex-shrink-0" />}
                          {log.status === 'running' && <RefreshCw size={16} className="text-amber-400 animate-spin flex-shrink-0" />}
                          {(() => {
                            let action = log.action || '';
                            let params = {};
                            if (action === 'goto') params = { url: log.target };
                            else if (action === 'fill') params = { field: log.target, value: log.value };
                            else if (action === 'click') params = { text: log.target };
                            else if (action === 'wait') params = { seconds: Number(log.value || 0) / 1000 };
                            else if (action === 'verify' || action === 'verify_text') params = { text: log.target || log.value };
                            else params = { target: log.target, value: log.value };

                            return (
                              <span className="text-secondary min-w-0 break-words [overflow-wrap:anywhere]">
                                <span className="text-indigo-600 dark:text-indigo-400 font-bold uppercase">{action === 'goto' && i === 0 ? 'Browser Launch / Network Init' : action}</span>
                                {" "}{JSON.stringify(params)}
                                <StepOutcome log={log}/>
                                {log.error_message && <span className="block text-red-600 dark:text-red-400 mt-1">{log.error_message}</span>}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="flex items-center justify-end gap-2 flex-shrink-0 max-w-[45%]">
                          <span className="text-[10px] text-muted">{log.duration_ms}ms</span>
                          {log.screenshot_url && (
                            <button onClick={() => setSelectedScreenshot(localAssetUrl(log.screenshot_url))}
                              className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
                              <Eye size={12}/> Screenshot
                            </button>
                          )}
                          <span className={`badge ${isFailed ? 'badge-error' : isSkipped ? 'badge-warning' : 'badge-success'} text-[10px]`}>
                            {log.status?.toUpperCase() || 'RUNNING'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="lg:col-span-5 space-y-3">
                <span className="section-label block">Playwright@Console</span>
                <div className="card overflow-hidden border border-zinc-800 shadow-xl flex flex-col h-[420px] bg-[#090b10]">
                  <div className="flex items-center justify-between border-b border-zinc-800/50 bg-[#11131c] px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span className="section-label pl-2 font-mono text-[10px] text-zinc-400">PLAYWRIGHT@CONSOLE</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">{executionLogs.length} step(s)</span>
                  </div>
                  <div className="p-4 font-mono text-[11px] space-y-1.5 overflow-y-auto scrollbar-thin text-zinc-300 flex-1">
                    {executionLogs.map((log, i) => {
                      const isFailed = log.status === 'failed' || log.status === 'Failed';
                      const isSkipped = isSkippedLog(log);
                      return (
                        <div key={i} className="flex items-start gap-1">
                          <span className="text-zinc-500 flex-shrink-0">[{(log.created_at || log.timestamp) ? new Date(log.created_at || log.timestamp).toLocaleTimeString() : '--:--:--'}]</span>
                          {isFailed ? (
                            <span className="text-red-400">✗ Step #{i+1} {log.action}: failed in {log.duration_ms}ms</span>
                          ) : isSkipped ? (
                            <span className="text-amber-400">- Step #{i+1} {log.action}: skipped ({log.error_message || 'dependent state unavailable'})</span>
                          ) : (
                            <span className="text-emerald-400">✓ Step #{i+1} {log.action}: passed in {log.duration_ms}ms</span>
                          )}
                        </div>
                      );
                    })}
                    {executing && (
                      <div className="flex items-center gap-1 text-indigo-400 animate-pulse">
                        <span>{isFinalizing ? 'Finalizing browser and saving results...' : 'Running next step...'}</span>
                        <span className="w-1.5 h-3 bg-indigo-400 animate-pulse" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* RESULTS */}
        {activeTab === 'results' && (() => {
          const { passedCount, failedCount, skippedCount, successRate, displayStatus, complete, checkedCount } = summarizeRun(resultsLogs, resultsStatus);
          const failedSteps = resultsLogs.filter(isFailedLog);
          const httpSpans = resultsTelemetry.filter(span => span?.attributes?.type === 'http');
          const networkFailures = httpSpans.filter(span =>
            String(span.status_code).toUpperCase() === 'ERROR' || Number(span?.attributes?.http_status || 0) >= 400
          );
          const groupedNetworkFailures = Object.values(networkFailures.reduce((groups, span) => {
            const attrs = span.attributes || {};
            const key = `${attrs.method || 'REQUEST'}|${attrs.url || span.name}|${attrs.http_status || 'transport'}`;
            if (!groups[key]) groups[key] = {
              key, method: attrs.method || 'REQUEST', url: attrs.url || span.name,
              status: attrs.http_status || 'transport failure', count: 0,
              steps: new Set(), duration: 0
            };
            groups[key].count += 1;
            if (attrs.step_number) groups[key].steps.add(attrs.step_number);
            groups[key].duration = Math.max(groups[key].duration, Number(span.duration_ms || 0));
            return groups;
          }, {})).map(group => ({
            ...group,
            steps: [...group.steps].sort((a, b) => a - b),
            source: networkSource(project?.app_url, group.url)
          }));
          const loginFill = resultsLogs.find(log => log.action === 'fill' && /email|user|login/.test(String(log.target).toLowerCase()));
          const passwordFill = resultsLogs.find(log => log.action === 'fill' && /password|passwd|pwd/.test(String(log.target).toLowerCase()));
          const authRows = [
            ['USERNAME ENTRY', loginFill ? (isFailedLog(loginFill) ? 'FAILED' : 'COMPLETED') : 'NOT OBSERVED'],
            ['PASSWORD ENTRY', passwordFill ? (isFailedLog(passwordFill) ? 'FAILED' : 'COMPLETED') : 'NOT OBSERVED'],
            ['FACE VIDEO', project?.face_auth_enabled ? (faceVideoStoragePath ? 'CONFIGURED' : 'MISSING') : 'NOT ENABLED'],
            ['VIRTUAL WEBCAM', project?.face_auth_enabled ? (videoPath ? 'AVAILABLE LOCALLY' : 'NOT AVAILABLE') : 'NOT ENABLED']
          ];
          return (
            <div className="space-y-6 max-w-7xl">
              <div className="grid grid-cols-4 gap-4">
                <div className="card p-4">
                  <p className="section-label">Total Steps</p>
                  <p className="text-2xl font-black mt-1 text-primary">{resultsLogs.length} Steps</p>
                </div>
                <div className="card p-4">
                  <p className="section-label">Passed</p>
                  <p className="text-2xl font-black mt-1 text-emerald-600 dark:text-emerald-400">{passedCount} Passed</p>
                </div>
                <div className="card p-4">
                  <p className="section-label">Failed</p>
                  <p className="text-2xl font-black mt-1 text-red-600 dark:text-red-400">{failedCount} Failed</p>
                </div>
                <div className="card p-4">
                  <p className="section-label">Success Rate</p>
                  <p className="text-2xl font-black mt-1 text-indigo-600 dark:text-indigo-400">{successRate}%</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="card p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
                    <h3 className="section-label">Execution Summary</h3>
                    <span className={`badge ${complete ? 'badge-success' : 'badge-warning'}`}>
                      {displayStatus}
                    </span>
                  </div>
                  <div className="space-y-2 text-xs font-mono text-secondary">
                    <div>Run ID: <span className="text-primary font-bold">#{resultsId?.slice(0,4) || 'N/A'}</span></div>
                    <div>Duration: <span className="text-primary">{(resultsDuration / 1000).toFixed(0)}s</span></div>
                    <div>Browser: <span className="text-indigo-600 dark:text-indigo-400 font-bold">{resultsBrowser}</span></div>
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setActiveTab('report')} className="btn-primary text-xs px-4 py-2">Download PDF</button>
                      <button onClick={handleExportCsv} className="btn-ghost text-xs px-4 py-2">Export CSV</button>
                    </div>
                  </div>
                </div>

                <div className="card p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
                    <h3 className="section-label">Authentication &amp; Biometric Summary</h3>
                    <span className="badge badge-indigo">Observed State</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                    {authRows.map(([k,v]) => (
                      <div key={k} className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900">
                        <span className="text-muted block text-[10px]">{k}</span>
                        <span className={`font-bold ${/FAILED|MISSING|NOT AVAILABLE/.test(v) ? 'text-red-500' : /PASSED|CONFIGURED|AVAILABLE/.test(v) ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted'}`}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="card p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="section-label">Playwright Step Audit</h3>
                  <button onClick={handleExportCsv} className="text-xs text-indigo-600 dark:text-indigo-400 font-mono hover:underline flex items-center gap-1">
                    <Download size={13}/> Download CSV
                  </button>
                </div>
                <div className="space-y-2">
                  {resultsLogs.length === 0 ? (
                    <p className="text-xs text-muted text-center py-4">No steps logs recorded for this run.</p>
                  ) : (
                    resultsLogs.map((log, i) => {
                      const isFailed = log.status === 'failed' || log.status === 'Failed';
                      const isSkipped = isSkippedLog(log);
                      return (
                        <div key={i} className={`card !rounded-xl p-3.5 border ${isFailed ? 'border-red-500/30 bg-red-500/5' : 'border-slate-100 dark:border-zinc-800'} text-xs font-mono`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {isFailed
                                ? <XCircle size={16} className="text-red-500 flex-shrink-0" />
                                : isSkipped
                                  ? <AlertCircle size={16} className="text-amber-500 flex-shrink-0" />
                                  : <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                              }
                              <span className="text-primary">
                                <span className="text-indigo-400 font-bold uppercase">{log.action === 'goto' && i === 0 ? 'Browser Launch / Network Init' : log.action}</span>
                                {log.target && ` ${JSON.stringify({ [log.action === 'fill' ? 'field' : 'url' || 'text']: log.target, ...(log.value ? { value: log.value } : {}) })}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-muted text-[10px]">{log.duration_ms}ms</span>
                              {log.screenshot_url && (
                                <button onClick={() => setSelectedScreenshot(localAssetUrl(log.screenshot_url))}
                                  className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
                                  <Eye size={12}/> Screenshot
                                </button>
                              )}
                              <span className={`badge ${isFailed ? 'badge-error' : isSkipped ? 'badge-warning' : 'badge-success'} text-[10px]`}>
                                {log.status?.toUpperCase()}
                              </span>
                            </div>
                          </div>
                          <StepOutcome log={log}/>
                          {isFailed && log.error_message && (
                            <div className="mt-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-[11px] leading-relaxed">
                              <span className="font-bold block mb-1">ERROR REASON</span>
                              {log.error_message}
                            </div>
                          )}
                          {isSkipped && (
                            <div className="mt-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] leading-relaxed">
                              <span className="font-bold block mb-1">SKIP REASON</span>
                              {log.error_message || 'Skipped because a required earlier page state was unavailable.'}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* OPENTELEMETRY AI OBSERVABILITY SECTION */}
              <div className="border-t border-slate-100 dark:border-zinc-800 pt-6 mt-8 space-y-6">
                <div className="flex items-center gap-3">
                  <Activity size={16} className="text-indigo-500" />
                  <h3 className="section-label !text-sm">Execution Traces &amp; Observed Browser Traffic</h3>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="card p-5 flex items-center justify-between">
                    <span className="section-label">Intercepted Network API Failures</span>
                    <span className={`text-2xl font-black ${networkFailures.length ? 'text-red-500' : 'text-primary'}`}>
                      {networkFailures.length}
                    </span>
                  </div>
                  <div className="card p-5 flex items-center justify-between">
                    <span className="section-label">OpenTelemetry Trace Spans</span>
                    <span className="text-2xl font-black text-primary">
                      {resultsTelemetry.length}
                    </span>
                  </div>
                </div>

                <div className="card p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
                    <h3 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Frontend Diagnostics &amp; Recommended Fix</h3>
                    <span className="badge badge-indigo">Execution Diagnostics</span>
                  </div>
                  <div className="space-y-3 text-xs">
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-1">
                      <span className="text-red-600 dark:text-red-400 font-bold block">🔴 FRONTEND FINDING (Playwright):</span>
                      {failedSteps.length > 0 ? (
                        <div className="space-y-3">
                          {failedSteps.map((failedStep, index) => {
                            const failure = classifyFailure(failedStep);
                            return <div key={failedStep.id || index} className="rounded-lg border border-red-200 dark:border-red-500/20 bg-white dark:bg-black/10 p-3 space-y-1">
                              <p className="font-bold text-red-700 dark:text-red-300">Step #{failedStep.step_number || resultsLogs.indexOf(failedStep) + 1}: {String(failedStep.action || 'action').toUpperCase()} {failedStep.target ? `— ${failedStep.target}` : ''}</p>
                              <p className="text-secondary">Category: {failure.category} · Duration: {failedStep.duration_ms || 0}ms</p>
                              <p className="text-secondary break-words">{failedStep.error_message || 'No detailed error was recorded.'}</p>
                              {failedStep.screenshot_url && <button onClick={() => setSelectedScreenshot(localAssetUrl(failedStep.screenshot_url))} className="text-indigo-700 dark:text-indigo-400 hover:underline">View failure screenshot</button>}
                            </div>;
                          })}
                          {skippedCount > 0 && <p className="text-secondary">{skippedCount} dependent step(s) were skipped to avoid misleading cascade failures.</p>}
                        </div>
                      ) : (
                        <p className="text-secondary">{resultsError || `${displayStatus}. ${checkedCount} outcome check(s) passed; absence of a recorded failure does not prove untested behavior.`}</p>
                      )}
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-1">
                      <span className="text-amber-600 dark:text-amber-400 font-bold block">💡 FRONTEND RECOMMENDED FIX:</span>
                      {failedSteps.length > 0 ? (
                        <div className="space-y-2">
                          {failedSteps.map((failedStep, index) => <p key={failedStep.id || index} className="text-secondary"><span className="font-bold text-primary">Step #{failedStep.step_number || resultsLogs.indexOf(failedStep) + 1}:</span> {classifyFailure(failedStep).recommendation}</p>)}
                        </div>
                      ) : (
                        <p className="text-secondary">{complete && checkedCount ? 'No remediation is suggested for the checked outcomes. Review coverage for untested requirements.' : 'Confirm the run completed and add explicit expected outcomes before assessing functional correctness.'}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="card p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
                    <h3 className="section-label">Observed Network &amp; OpenTelemetry Diagnostics</h3>
                    <span className="badge badge-indigo">Observed Browser Traffic</span>
                  </div>
                  <div className="space-y-3 text-xs">
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-1">
                      <span className="text-violet-600 dark:text-violet-400 font-bold block">⚙ OBSERVED NETWORK FINDING:</span>
                      {networkFailures.length > 0 ? (
                        <>
                          <p className="text-secondary">{networkFailures.length} observed request(s) returned an error.</p>
                          {groupedNetworkFailures.map(group => {
                            return <div key={group.key} className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-black/10 p-3 space-y-1">
                              <p className="font-bold text-primary">{group.source}: {group.method} {group.url}</p>
                              <p className="text-secondary">HTTP {group.status} · {group.count} occurrence(s){group.steps.length ? ` · Step(s) ${group.steps.join(', ')}` : ''} · Slowest ${group.duration}ms</p>
                            </div>;
                          })}
                        </>
                      ) : httpSpans.length > 0 ? (
                        <p className="text-secondary">{httpSpans.length} browser request(s) were observed with no HTTP or transport failures.</p>
                      ) : (
                        <p className="text-secondary">No browser network spans were collected for this run, so backend health cannot be concluded from this result.</p>
                      )}
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-1">
                      <span className="text-violet-600 dark:text-violet-400 font-bold block">⚙ BACKEND RECOMMENDED FIX:</span>
                      {networkFailures.length > 0 ? (
                        <div className="space-y-2">
                          {groupedNetworkFailures.map(group => <p key={group.key} className="text-secondary"><span className="font-bold text-primary">{group.method} {group.url}:</span> {networkRecommendation(group)}</p>)}
                        </div>
                      ) : (
                        <p className="text-secondary">No network remediation is suggested from the available evidence.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* REPORT */}
        {activeTab === 'report' && (() => {
          const { passedCount, failedCount, totalStepsCount, successRate, displayStatus, complete } = summarizeRun(resultsLogs, resultsStatus);

          return (
            <div className="space-y-6">
              <style dangerouslySetInnerHTML={{__html: `
                @media print {
                  aside, header, .report-toolbar { display: none !important; }
                  main { padding: 0 !important; margin: 0 !important; }
                  .report-card-container { padding: 0 !important; border: none !important; background: transparent !important; }
                  .report-card { border: none !important; box-shadow: none !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; background: white !important; color: black !important; }
                  body { background: white !important; }
                }
              `}} />
              
              {/* Report Toolbar */}
              <div className="report-toolbar flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                <button onClick={() => setActiveTab('results')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors">
                  <ArrowLeft size={13}/> Back
                </button>
                
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={includeScreenshots} onChange={e => setIncludeScreenshots(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-900 w-4 h-4" />
                    Include Step Screenshots in PDF
                  </label>
                  <button onClick={handleExportCsv} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors">
                    <Download size={13}/> Export Results CSV
                  </button>
                  <button onClick={handleDownloadPdfDirect} className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5">
                    <Download size={13} /> Download PDF
                  </button>
                </div>
              </div>

              {/* Report Card */}
              <div className="report-card-container flex justify-center p-4">
                <div className="report-card bg-white text-slate-900 w-full max-w-4xl p-8 rounded-2xl shadow-xl border border-slate-200 font-sans">
                  <div className="flex justify-between items-start border-b-2 border-slate-200 pb-5 mb-6">
                    <div>
                      <div className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1">☉ QA-AI Platform</div>
                      <h1 className="text-2xl font-black text-slate-900 tracking-tight">Automation Test Execution Report</h1>
                      <p className="text-[11px] text-slate-400 font-mono mt-1">Generated {new Date(resultsDate || Date.now()).toLocaleString()}</p>
                    </div>
                    <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border uppercase ${
                      complete ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}>{displayStatus}</span>
                  </div>

                  <div className="grid grid-cols-4 gap-4 mb-6 border-b border-slate-100 pb-5 text-xs">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Project Name</p>
                      <p className="font-bold text-slate-700 mt-1">{project.name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Execution Run</p>
                      <p className="font-bold text-indigo-600 font-mono mt-1">#{resultsId?.slice(0,6) || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Execution Date</p>
                      <p className="font-bold text-slate-700 mt-1">{resultsDate ? new Date(resultsDate).toLocaleDateString() : new Date().toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Total Duration</p>
                      <p className="font-bold text-slate-700 mt-1">{(resultsDuration / 1000).toFixed(0)}s</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-4 mb-8">
                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                      <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Total Test Steps</p>
                      <p className="text-lg font-black text-slate-800 mt-1">{totalStepsCount} Steps</p>
                    </div>
                    <div className="border border-slate-200 rounded-xl p-4 bg-emerald-50/30">
                      <p className="text-[9px] text-emerald-600 uppercase font-bold tracking-wider">Passed Steps</p>
                      <p className="text-lg font-black text-emerald-700 mt-1">{passedCount} Passed</p>
                    </div>
                    <div className="border border-slate-200 rounded-xl p-4 bg-red-50/30">
                      <p className="text-[9px] text-red-600 uppercase font-bold tracking-wider">Failed Steps</p>
                      <p className="text-lg font-black text-red-700 mt-1">{failedCount} Failed</p>
                    </div>
                    <div className="border border-slate-200 rounded-xl p-4 bg-indigo-50/30">
                      <p className="text-[9px] text-indigo-600 uppercase font-bold tracking-wider">Pass Success Rate</p>
                      <p className="text-lg font-black text-indigo-700 mt-1">{successRate}% Rate</p>
                    </div>
                  </div>

                  <h3 className="text-xs uppercase text-slate-800 font-bold mb-4 border-b border-slate-300 pb-2">Execution Log</h3>
                  <div className="space-y-5">
                    {resultsLogs.map((log, index) => {
                      const isFailed = log.status === 'failed' || log.status === 'Failed';
                      return (
                        <div key={index} className={`border rounded-xl p-4 ${isFailed ? 'border-red-300 bg-red-50/30' : 'border-slate-200 bg-white'}`}>
                          <div className="flex justify-between items-center border-b border-dashed border-slate-100 pb-2 mb-3">
                            <div className="text-sm font-bold text-slate-800">
                              #{index + 1} &nbsp; <span className="font-mono text-indigo-600 uppercase">{log.action === 'goto' && index === 0 ? 'Browser Launch / Network Init' : log.action}</span>
                              {log.target && (
                                <span className="text-slate-500 text-xs font-normal font-mono ml-2">
                                  {JSON.stringify({ [log.action === 'fill' ? 'field' : 'url' || 'text']: log.target, ...(log.value ? { value: log.value } : {}) })}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] text-slate-500 font-mono">{log.duration_ms || 0}ms</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                isFailed ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                              }`}>{log.status}</span>
                            </div>
                          </div>
                          <StepOutcome log={log}/>
                          {isFailed && log.error_message && (
                            <div className="p-3 bg-red-100/50 border border-red-200 rounded-lg text-red-900 font-mono text-xs mb-3">
                              <span className="font-bold block mb-1">FAILURE REASON:</span>
                              {log.error_message}
                            </div>
                          )}
                          {includeScreenshots && log.screenshot_url && (
                            <div className="mt-3 border border-slate-200 rounded-lg overflow-hidden max-w-lg bg-slate-50">
                              <img src={localAssetUrl(log.screenshot_url)} alt={`Step #${index+1}`} className="w-full h-auto" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-4 max-w-7xl">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {['All', 'Passed', 'Failed'].map(f => (
                  <button key={f} onClick={() => setHistoryFilter(f)}
                    className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition-colors ${
                      historyFilter === f ? 'btn-primary !py-1.5 !px-3' : 'btn-ghost !py-1.5 !px-3'
                    }`}>{f}</button>
                ))}
              </div>
              <span className="text-xs text-muted font-mono">{execHistory.length} records</span>
            </div>

            {execHistory.length === 0 ? (
              <div className="p-10 card text-center text-xs text-muted">No execution history records found.</div>
            ) : (
              <div className="card overflow-hidden divide-y divide-slate-100 dark:divide-zinc-800">
                {execHistory.filter(e => historyFilter === 'All' || e.status === historyFilter).map((exec, idx) => (
                  <div key={exec.id || idx} className="p-4 hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-4">
                      <span className="text-muted font-bold">#{exec.id?.slice(0,4) || (idx + 1)}</span>
                      <span className={`badge ${exec.status === 'Passed' || exec.status === 'passed' ? 'badge-success' : 'badge-error'}`}>
                        {exec.status === 'Passed' || exec.status === 'passed' ? <CheckCircle2 size={10}/> : <XCircle size={10}/>} {exec.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-6 text-muted">
                      <span>⏱ {(exec.duration_ms / 1000).toFixed(0)}s</span>
                      <span>{exec.created_at ? new Date(exec.created_at).toLocaleDateString() : ''}</span>
                      <div className="flex gap-3 items-center">
                        <button onClick={() => handleViewHistoryRun(exec.id, exec)} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 transition-colors p-1" title="View Results">
                          <Eye size={14}/>
                        </button>
                        <button onClick={async () => {
                          await handleViewHistoryRun(exec.id, exec);
                          setActiveTab('report');
                        }} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 transition-colors p-1" title="Download Report">
                          <Download size={14}/>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Test Case Modal */}
      {editingTc && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingTc(null)}>
          <div className="card w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden bg-slate-900 border border-slate-700 dark:border-zinc-800 shadow-2xl space-y-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Edit3 size={16} className="text-indigo-400" />
                <h3 className="font-bold text-sm text-white">Edit Test Case #{editingTc.id?.slice(0,4)}</h3>
              </div>
              <button onClick={() => setEditingTc(null)} className="text-slate-400 hover:text-white transition-colors text-xs font-bold px-2 py-1">✕</button>
            </div>

            <div className="space-y-4 overflow-y-auto scrollbar-thin pr-1 flex-1">
              <div className="space-y-1.5">
                <label className="section-label">Test Case Name</label>
                <input type="text" value={editingTc.name} onChange={e => setEditingTc({...editingTc, name: e.target.value})}
                  className="input-field" placeholder="e.g. Navigation & Login Test" />
              </div>

              {editingTc.type === 'structured' && <TestStepBuilder steps={editingTc.cached_json || []} onChange={steps => setEditingTc({...editingTc, cached_json: steps, commands: describeSteps(steps)})}/>}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[340px]">
                <div className="card flex flex-col overflow-hidden bg-slate-950/80 border border-slate-800">
                  <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between flex-shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Natural Language Commands</span>
                    <span className="text-[10px] text-slate-500 font-mono">{(editingTc.commands || '').split('\n').filter(Boolean).length} steps</span>
                  </div>
                  <textarea readOnly={editingTc.type === 'structured'} value={editingTc.commands} onChange={e => setEditingTc({...editingTc, commands: e.target.value})}
                    className="flex-1 bg-transparent text-slate-200 text-xs font-mono p-3.5 resize-none focus:outline-none leading-relaxed scrollbar-thin"
                    placeholder="Enter step commands..." />
                </div>

                <div className="card flex flex-col overflow-hidden bg-slate-950/80 border border-slate-800">
                  <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/80 flex-shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Playwright JSON Actions</span>
                  </div>
                  <pre className="flex-1 bg-transparent text-emerald-400 text-[11px] font-mono p-3.5 overflow-y-auto leading-relaxed scrollbar-thin">
                    {JSON.stringify(editingTc.cached_json || [], null, 2)}
                  </pre>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-3">
                <button type="button"
                  disabled={translating}
                  onClick={async () => {
                    setTranslating(true);
                    setTranslationTime(0);
                    setTranslationStatusMsg('');
                    const startTime = Date.now();
                    const timerInterval = setInterval(() => {
                      setTranslationTime(Number(((Date.now() - startTime) / 1000).toFixed(1)));
                    }, 100);
                    try {
                      const res = editingTc.type === 'structured' ? await AIService.validateSteps(editingTc.cached_json) : await AIService.translatePrompt(editingTc.commands);
                      if (res && res.steps) {
                        if (res.requires_review && !window.confirm('Review AI-generated steps before applying:\n' + JSON.stringify(res.steps, null, 2))) return;
                        setEditingTc({...editingTc, cached_json: res.steps});
                        const finalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
                        setTranslationStatusMsg(`Translated in ${finalDuration}s`);
                      } else {
                        alert("Translation returned empty steps.");
                      }
                    } catch (err) {
                      alert("Gemini Translation failed: " + err.message);
                      setTranslationStatusMsg('Translation failed');
                    } finally {
                      clearInterval(timerInterval);
                      setTranslating(false);
                    }
                  }}
                  className="btn-ghost text-xs px-3.5 py-2 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/10 font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Sparkles size={13} className={translating ? "animate-spin" : ""} />
                  {translating ? `Translating (${translationTime}s)...` : "Validate / Translate Steps"}
                </button>
                {translationStatusMsg && (
                  <span className={`text-xs font-semibold ${translationStatusMsg.includes('failed') ? 'text-red-400' : 'text-emerald-400'}`}>
                    {translationStatusMsg}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditingTc(null)} className="btn-ghost text-xs px-4 py-2">Cancel</button>
                <button type="button" onClick={handleSaveEditModal} className="btn-primary text-xs px-5 py-2">Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Project Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowDeleteModal(false)}>
          <div className="card p-6 max-w-md w-full space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-950/50 flex items-center justify-center">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="font-bold text-primary text-base">Delete Project</h3>
                <p className="text-xs text-secondary">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-xs text-secondary leading-relaxed">
              Are you sure you want to delete <strong className="text-primary">{project.name}</strong>? This will permanently remove all test cases, suites, and execution logs.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowDeleteModal(false)} className="btn-ghost text-xs px-4 py-2">Cancel</button>
              <button onClick={handleDeleteProject} className="px-4 py-2 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs transition-all shadow-md shadow-red-500/20">Delete Project</button>
            </div>
          </div>
        </div>
      )}

      {/* Screenshot Lightbox */}
      {selectedScreenshot && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setSelectedScreenshot(null)}>
          <div className="max-w-4xl max-h-[90vh] card overflow-hidden border border-slate-800 p-2 relative">
            <img src={selectedScreenshot} alt="Step Screenshot" className="w-full h-auto max-h-[80vh] object-contain rounded-xl" />
            <div className="p-3 flex items-center justify-between text-xs text-secondary font-mono">
              <span>Playwright Step Screenshot</span><span>Click anywhere to dismiss</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
