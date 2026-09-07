import DraftTools from '../../components/DraftTools';
import React, { useEffect, useRef, useState } from 'react';
import { DesktopService } from '../../services/api';
import WorkspaceTools from '../../components/WorkspaceTools';
import { Cloud, Monitor, Layers3, ListChecks, Play, History, Sparkles } from 'lucide-react';
import { downloadDesktopReport } from '../../lib/desktop-report';

export default function DesktopWorkspace({ project, onSelectProject }) {
  const [syncRevision,setSyncRevision]=useState(0);
  const [windows, setWindows] = useState([]);
  const [selected, setSelected] = useState('');
  const [inspected,setInspected]=useState(false);
  const [controls, setControls] = useState([]);
  const [steps, setSteps] = useState([]);
  const [confirmed, setConfirmed] = useState(false);
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [operationKind, setOperationKind] = useState('');
  const [history, setHistory] = useState([]);
  const [savedMessage, setSavedMessage] = useState('');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [tests, setTests] = useState([]);
  const [testId, setTestId] = useState('');
  const [testName, setTestName] = useState('New desktop test');
  const [dirty, setDirty] = useState(false);
  const [suiteIds, setSuiteIds] = useState([]);
  const [continueOnFailure, setContinueOnFailure] = useState(false);
  const [suiteMessage, setSuiteMessage] = useState('');
  const [suites, setSuites] = useState([]);
  const [suiteId, setSuiteId] = useState('');
  const [suiteName, setSuiteName] = useState('New desktop suite');
  const storedSuite = suites.find(s => s.id === suiteId);
  const suiteDirty = !storedSuite || suiteName !== (storedSuite.name || 'New desktop suite') || JSON.stringify(suiteIds) !== JSON.stringify(storedSuite.test_ids) || continueOnFailure !== Boolean(storedSuite.continue_on_failure);
  function switchSuite(id) {
    if (suiteDirty && (suiteId || suiteIds.length || suiteName !== 'New desktop suite' || continueOnFailure) && !globalThis.confirm('Discard unsaved suite changes?')) return;
    chooseSuite(suites.find(s => s.id === id));
  }
  async function saveSuite() {
    setBusy(true); setError('');
    try {
      const saved = await DesktopService.saveNamedSuite(project.id, suiteId, suiteName, suiteIds, continueOnFailure);
      setSuites(old => [saved, ...old.filter(s => s.id !== saved.id)]);
      setSuiteId(saved.id); setSuiteName(saved.name);
      setSuiteMessage('Named suite order and failure policy saved locally.'); setSyncRevision(n=>n+1);
    }
    catch(e) { setError(e.message); }
    finally { setBusy(false); }
  }
  function chooseSuite(suite) {
    setSuiteId(suite?.id || ''); setSuiteName(suite?.name || 'New desktop suite');
    setSuiteIds(suite?.test_ids || []); setContinueOnFailure(Boolean(suite?.continue_on_failure));
    setConfirmed(false); setSuiteMessage('');
  }
  function chooseTest(test) {
    setTestId(test?.id || ''); setTestName(test?.name || 'New desktop test');
    setSteps(test?.steps || []); setDirty(false); setConfirmed(false); setJob(null); setSavedMessage('');
  }
  function switchTest(id) {
    if (dirty && !globalThis.confirm('Discard unsaved test changes?')) return;
    chooseTest(tests.find(t => t.id === id));
  }
  const displayDate = value => value ? new Date(value).toLocaleString() : 'Time unavailable';
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; onSelectProject(project); return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    Promise.all([DesktopService.listTests(project.id), DesktopService.history(project.id), DesktopService.listSuites(project.id)])
      .then(([saved, runs, storedSuites]) => { if (mounted.current) { setTests(saved); chooseTest(saved[0]); setHistory(runs); setSuites(storedSuites); chooseSuite(storedSuites[0]); } })
      .catch(e => { if (mounted.current) setError(e.message); })
      .finally(() => { if (mounted.current) setLoading(false); });
  }, [project.id]);
  async function save() {
    setBusy(true); setError('');
    try {
      const saved = await DesktopService.saveNamedTest(project.id, testId, testName, steps);
      setTests(old => [saved, ...old.filter(t => t.id !== saved.id)]); setTestId(saved.id); setDirty(false);
      setSavedMessage('Test saved on this computer.'); setSyncRevision(n=>n+1);
    }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const window = windows.find(w => String(w.handle) === selected);
  const readyTargets = inspected && steps.length > 0 && steps.every(s => s.target && Object.keys(s.target).length && Object.values(s.target).every(v=>typeof v==='string'&&v.trim()));
  const readiness = !window ? 'Select a running application to begin.' : !controls.length ? 'Inspect the selected window to identify its controls.' : !steps.length ? 'Add an action and an assertion to build your test.' : !readyTargets ? 'Reselect saved targets that are missing from this inspection.' : !confirmed ? 'Review the steps and authorize interaction before running.' : 'Ready to run against the selected window.';
  function replaceSteps(next) { setSteps(next); setDirty(true); setConfirmed(false); setSavedMessage('Unsaved changes'); }
  async function operate(kind, suite = false) {
    setBusy(true); setError(''); setJob(null); setOperationKind(kind);
    try {
      const { id } = await DesktopService.createJob({ kind, ...window, steps, confirmed, project_id: project.id, test_id: kind === 'run' ? testId || undefined : undefined,
        ...(suite ? {suite_id: suiteId} : {}) });
      if (!mounted.current) return;
      setJob({ id, status: 'running', steps: [] });
      let result;
      do {
        await new Promise(resolve => setTimeout(resolve, 400));
        if (!mounted.current) return;
        result = await DesktopService.getJob(id);
        if (!mounted.current) return;
        setJob(result);
      } while (['running', 'stopping'].includes(result.status));
      if (result.status === 'passed') {
        if (kind === 'windows') { setWindows(result.windows); setSelected(''); setControls([]);setInspected(false); setConfirmed(false); }
        if (kind === 'controls') {setControls(result.controls);setInspected(true);}
      } else if (result.error) setError(result.error);
      if (kind === 'run') {setHistory(await DesktopService.history(project.id));setSyncRevision(n=>n+1);}
    } catch (e) { if (mounted.current) setError(e.message); }
    finally { if (mounted.current) setBusy(false); }
  }
  function update(index, change) { replaceSteps(steps.map((s, i) => i === index ? { ...s, ...change } : s)); }
  return <div className="desktop-workspace max-w-7xl mx-auto space-y-5 text-primary" aria-busy={busy || loading}>
    <header className="workspace-hero p-6 space-y-2">
      <p className="text-secondary text-sm">DESKTOP AUTOMATION · VERSION 2</p>
      <h1 className="text-2xl font-bold">{project.name}</h1>
      <p className="text-secondary">Build reliable desktop tests. Organize suites, protect test credentials, and keep your work connected across devices. Every run stays on the computer you authorize.</p>
    </header>
    <WorkspaceTools project={project} disabled={busy||loading||dirty||Boolean(suiteId&&suiteDirty)} revision={syncRevision} onRestored={async()=>{const [saved,runs,stored]=await Promise.all([DesktopService.listTests(project.id),DesktopService.history(project.id),DesktopService.listSuites(project.id)]);setTests(saved);chooseTest(saved[0]);setHistory(runs);setSuites(stored);chooseSuite(stored[0]);}}/>
    <nav className="workspace-jumpbar" aria-label="Workspace sections">{[['library','Test library',Layers3],['application','Application',Monitor],['steps','Test builder',ListChecks],['run','Run & review',Play],['history','History',History]].map(([id,label,Icon])=><button key={id} onClick={()=>document.getElementById(`desktop-${id}`)?.scrollIntoView({behavior:'smooth',block:'start'})}><Icon size={16}/>{label}</button>)}</nav>
    <section id="desktop-library" className="card p-6 space-y-4">
      <h2 className="text-lg font-bold">Test library</h2>
      <select aria-label="Saved desktop test" className="input-field" disabled={busy || loading} value={testId} onChange={e => switchTest(e.target.value)}>
        <option value="">New unsaved test</option>
        {tests.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <label>Test name<input aria-label="Test name" className="input-field" maxLength={120} value={testName} disabled={busy || loading} onChange={e => { setTestName(e.target.value); setDirty(true); setConfirmed(false); }}/></label>
      <button className="btn-primary" disabled={busy || loading} onClick={() => switchTest('')}>New test</button>
      <p className="text-secondary">Each named test is saved separately. Switching tests resets authorization. Existing test history stays intact.</p>
      <h3 className="font-bold">Run saved tests as a suite</h3>
      <p className="text-secondary">Select in execution order (maximum 20 tests / 100 total steps). Each test must include its own setup. The application is not reset between tests. Only saved steps are used.</p>
      <select aria-label="Saved desktop suite" className="input-field" disabled={busy || loading} value={suiteId} onChange={e => switchSuite(e.target.value)}>
        <option value="">New unsaved suite</option>
        {suites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <label>Suite name<input aria-label="Suite name" className="input-field" maxLength={120} disabled={busy || loading} value={suiteName} onChange={e => { setSuiteName(e.target.value); setConfirmed(false); }}/></label>
      <button disabled={busy || loading} onClick={() => switchSuite('')}>New suite</button>
      {tests.map(t => <label key={t.id} className="flex gap-3"><input type="checkbox" aria-label={`Include ${t.name} in suite`} disabled={busy || loading} checked={suiteIds.includes(t.id)} onChange={e => {setSuiteIds(old => e.target.checked ? [...old, t.id] : old.filter(id => id !== t.id)); setConfirmed(false); }}/>{t.name}{suiteIds.includes(t.id) ? ` · order ${suiteIds.indexOf(t.id)+1}` : ''}</label>)}
      <label className="flex gap-3"><input type="checkbox" aria-label="Continue suite after failure" disabled={busy} checked={continueOnFailure} onChange={e => {setContinueOnFailure(e.target.checked); setConfirmed(false); }}/>Continue after failed tests (later tests must be independent)</label>
      <button className="btn-primary" disabled={busy || loading || !suiteIds.length} onClick={saveSuite}>Save suite locally</button>
      <p className="text-secondary">{suiteMessage}</p>
    </section>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4" aria-label="Desktop overview">
      {[['Test steps', steps.length], ['Inspected controls', controls.length], ['Saved runs', history.length], ['Passed runs', history.filter(r => r.status === 'passed').length]].map(([label, value]) => <div key={label} className="card p-4"><p className="text-secondary text-sm">{label}</p><p className="text-2xl font-bold mt-1">{value}</p></div>)}
    </div>
    <p className="card p-4 text-secondary" aria-live="polite">{loading ? 'Loading saved test and history…' : readiness}</p>
    {error && <p role="alert" className="card p-4 text-red-600 dark:text-red-400 break-words">{error}</p>}
    <section id="desktop-application" className="card p-6 space-y-4">
      <h2 className="text-lg font-bold">1. Select application</h2>
      <p className="text-secondary text-sm">Open a disposable test document first. Window discovery reads visible window titles. Do not select an application with important unsaved data.</p>
      <button className="btn-primary" disabled={busy || loading} onClick={() => operate('windows')}>Refresh running windows</button>
      <select aria-label="Application window" className="input-field" disabled={busy} value={selected} onChange={e => { setSelected(e.target.value); setControls([]);setInspected(false); setConfirmed(false); }}>
        <option value="">Select a window</option>
        {windows.map(w => <option key={w.handle} value={w.handle}>{w.title} · PID {w.process_id}</option>)}
      </select>
      <button className="btn-primary" disabled={busy || !window} onClick={() => operate('controls')}>Inspect selected window</button>
    </section>
    <DraftTools project={project} disabled={busy||loading} onDraft={draft=>{if(dirty&&!globalThis.confirm('Replace the unsaved test draft?'))return;chooseTest(null);replaceSteps(draft);document.getElementById('desktop-steps')?.scrollIntoView({behavior:'smooth'});}}/>
    <section id="desktop-steps" className="card p-6 space-y-4">
      <h2 className="text-lg font-bold">2. Build test steps</h2>
      <p className="text-secondary text-sm">Fill replaces contents. Verification checks exact text. Saving protects steps with your Windows account. Older plaintext tests are protected when saved again; old backups may still contain plaintext. Use test data, not production credentials. Save updates only the selected test.</p>
      {steps.map((step, i) => <div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
        <label>Step {i + 1}<select aria-label={`Step ${i + 1} action`} disabled={busy} className="input-field" value={step.action} onChange={e => update(i, { action: e.target.value })}>
          <option value="click">Click</option><option value="fill">Fill text</option><option value="verify_text">Verify exact text</option>
          <option value="verify_visible">Verify visible</option><option value="verify_enabled">Verify enabled</option><option value="verify_checked">Verify checked</option>
          <option value="check">Check checkbox</option><option value="uncheck">Uncheck checkbox</option><option value="select">Select item</option>
          <option value="expand">Expand menu / dropdown</option><option value="collapse">Collapse menu / dropdown</option>
        </select></label>
        <select aria-label={`Step ${i + 1} control`} disabled={busy} className="input-field" value={JSON.stringify(step.target)} onChange={e => update(i, { target: JSON.parse(e.target.value) })}>
          {!controls.some(c => JSON.stringify(c.target) === JSON.stringify(step.target)) && <option value={JSON.stringify(step.target)}>Custom target — located during execution</option>}
          {controls.map((c, index) => <option key={index} value={JSON.stringify(c.target)}>{c.target.control_type}: {c.label}</option>)}
        </select>
        <input aria-label={`Step ${i + 1} value`} disabled={busy || !['fill', 'verify_text'].includes(step.action)} className="input-field" placeholder="Exact text" value={step.value} onChange={e => update(i, { value: e.target.value })}/>
        <details className="md:col-span-4"><summary className="text-xs text-indigo-500">Edit target for a control that appears later</summary><div className="grid md:grid-cols-3 gap-3">{['name','automation_id','control_type'].map(key=><label key={key} className="text-xs text-secondary">{key.replace('_',' ')}<input className="input-field" aria-label={`Step ${i+1} target ${key}`} disabled={busy} value={step.target?.[key]||''} onChange={e=>{const target={...step.target};if(e.target.value)target[key]=e.target.value;else delete target[key];update(i,{target});}}/></label>)}</div><p className="text-xs text-muted">Use the application's exact accessible name or automation ID. The control can appear after an earlier step; ambiguous matches fail instead of guessing.</p></details>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy || i === 0} aria-label={`Move step ${i + 1} up`} onClick={() => { const next = [...steps]; [next[i-1], next[i]] = [next[i], next[i-1]]; replaceSteps(next); }}>↑ Move up</button>
          <button disabled={busy || i === steps.length - 1} aria-label={`Move step ${i + 1} down`} onClick={() => { const next = [...steps]; [next[i+1], next[i]] = [next[i], next[i+1]]; replaceSteps(next); }}>↓ Move down</button>
          <button disabled={busy} onClick={() => replaceSteps(steps.filter((_, index) => index !== i))}>Remove step {i + 1}</button>
        </div>
      </div>)}
      <button className="btn-primary" disabled={busy || !controls.length || steps.length >= 100} onClick={() => replaceSteps([...steps, { action: 'click', target: controls[0].target, value: '', timeout_seconds: 10 }])}>Add step</button>
      <button className="btn-primary" disabled={busy || loading || !steps.length} onClick={save}>Save test locally</button>
      {steps.length > 0 && !steps.some(s => s.action.startsWith('verify_')) && <p className="text-secondary">This test has actions only. Add a verification step to check the outcome.</p>}
      <p>{savedMessage}</p>
    </section>
    <section id="desktop-run" className="card p-6 space-y-4">
      <h2 className="text-lg font-bold">3. Run and review</h2>
      <label className="flex gap-3"><input type="checkbox" disabled={busy} checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>I authorize these actions in the selected test window.</label>
      <div className="flex gap-4">
        <button className="btn-primary" disabled={busy || loading || suiteDirty || (dirty && suiteIds.includes(testId)) || !window || !confirmed || !suiteId || !suiteIds.length || suiteIds.length > 20 || !controls.length} onClick={() => operate('run', true)}>Run selected suite</button>
        <button className="btn-primary" disabled={busy || (testId && dirty) || !window || !steps.length || !confirmed || !readyTargets} onClick={() => operate('run')}>Run desktop test</button>
        <button disabled={job?.status !== 'running'} onClick={() => DesktopService.stop(job.id).catch(e => setError(e.message))}>Stop operation</button>
      </div>
      {testId && dirty && <p className="text-secondary">Save changes before running this named test.</p>}
      {suiteDirty && <p className="text-secondary">Save suite changes before running the selected suite.</p>}
      <p role="status">{busy ? (job?.status === 'stopping' ? 'Stopping automation…' : 'Operation running…') : job ? operationKind === 'run' ? `Test result: ${job.status}` : operationKind === 'controls' && job.status === 'passed' ? `Inspection complete: ${controls.length} controls found. Add a step to continue.` : operationKind === 'windows' && job.status === 'passed' ? `Found ${windows.length} windows. Select your test application.` : `Inspection result: ${job.status}` : 'Ready'}</p>
      {job?.steps?.map(s => <div key={s.step_number} className="border-b border-slate-400/30 py-3 break-words">
        {s.test_name && <p className="text-secondary">{s.test_name}</p>}
        <strong>Step {s.step_number}: {s.action} — {s.status}</strong><span className="text-secondary"> · {s.duration_ms == null ? 'Duration unavailable' : `${s.duration_ms} ms`} · {displayDate(s.completed_at)}</span>
        {s.error && <p className="text-red-600 dark:text-red-400">{s.error}{s.error_type ? ` (${s.error_type})` : ''}</p>}
        {s.recommendation && <p className="text-secondary">Recommended check: {s.recommendation}</p>}
      </div>)}
      {job?.tests?.map((t, i) => <p key={i}>{t.test_name} — {t.status}</p>)}
      <p className="text-secondary text-sm">Stop terminates the automation worker, not the application. Pending steps are not passed. Leaving this screen does not stop an active job; stop it first. A run is capped at five minutes.</p>
    </section>
    <section id="desktop-history" className="card p-6 space-y-4">
      <h2 className="text-lg font-bold">4. Local run history</h2>
      <select aria-label="Filter run history" className="input-field" value={historyFilter} onChange={e => setHistoryFilter(e.target.value)}>
        <option value="all">All results</option><option value="passed">Passed</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option><option value="interrupted">Interrupted</option><option value="timeout">Timed out</option>
      </select>
      {!history.length && <p>No saved runs yet.</p>}
      {history.filter(run => historyFilter === 'all' || run.status === historyFilter).map(run => <details key={run.id} className="border-b border-slate-400/30 py-3">
        <summary>{run.test_name || 'Earlier desktop run'} · {displayDate(run.created_at)} — {run.status} · {run.steps.length} steps</summary>
        <div className="flex flex-wrap gap-3 my-3">
          <button className="btn-primary" onClick={() => downloadDesktopReport(run, 'html')}>Download readable report</button>
          <button className="btn-primary" onClick={() => downloadDesktopReport(run, 'json')}>Download JSON report</button>
        </div>
        <p className="text-secondary text-sm">Reports exclude saved inputs and control targets. Review test names and diagnostics before sharing. Open the readable report in a browser to print or save as PDF.</p>
        {run.error && <p>{run.error}</p>}
        {run.tests?.map((t, i) => <p key={i}>{t.test_name} — {t.status}</p>)}
        {run.steps.map(s => <div key={s.step_number}><p>Step {s.step_number}: {s.action} — {s.status}</p>{s.error && <p>{s.error}</p>}{s.recommendation && <p>{s.recommendation}</p>}</div>)}
      </details>)}
    </section>
  </div>;
}
