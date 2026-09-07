const fields = (value, keys) => Object.fromEntries(keys.filter(k => value?.[k] !== undefined).map(k => [k, value[k]]));
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function desktopReport(run) {
  const steps = (run.steps || []).map(s => fields(s, ['step_number','action','status','duration_ms','completed_at','test_name','error','error_code','recommendation']));
  const counts = {};
  for (const step of steps) counts[step.status || 'unknown'] = (counts[step.status || 'unknown'] || 0) + 1;
  return {
    report_version: 1, runner: 'Windows desktop',
    ...fields(run, ['id','test_name','status','created_at','duration_ms','error']),
    counts, assertion_count: steps.filter(s => s.action?.startsWith('verify_')).length,
    tests: (run.tests || []).map(t => fields(t, ['test_name','status'])), steps,
    note: 'Actions completing does not prove functional correctness. Review assertions and every incomplete step. Input values, control targets and window identity are excluded; review names and diagnostics before sharing.'
  };
}

export function desktopReportHtml(run) {
  const r = desktopReport(run);
  const row = s => `<tr><td>${escape(s.step_number)}</td><td>${escape(s.test_name || '')}<br>${escape(s.action)}</td><td>${escape(s.status)}</td><td>${s.duration_ms == null ? 'Unavailable' : escape(s.duration_ms) + ' ms'}</td><td>${escape(s.error || '')}<br>${escape(s.recommendation || '')}</td></tr>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Desktop test report</title><style>body{font:16px system-ui,sans-serif;color:#172033;background:#fff;margin:40px;line-height:1.5}main{max-width:1100px;margin:auto}h1{color:#312e81}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #cbd5e1;padding:12px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#eef2ff}p{overflow-wrap:anywhere}.note{color:#475569}@media print{body{margin:12mm}thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body><main><h1>Desktop test report</h1><h2>${escape(r.test_name || 'Desktop run')}</h2><p>Status: <strong>${escape(r.status || 'unknown')}</strong> · Run: ${escape(r.id)}</p><p>Started: ${escape(r.created_at || 'Unavailable')} · Duration: ${r.duration_ms == null ? 'Unavailable' : escape(r.duration_ms) + ' ms'}</p><p>${escape(Object.entries(r.counts).map(([key,value]) => `${key}: ${value}`).join(' · '))} · Assertion steps: ${r.assertion_count}</p><p class="note">${escape(r.note)}</p>${r.error ? `<p>${escape(r.error)}</p>` : ''}${r.tests.length ? `<h2>Suite results</h2><ul>${r.tests.map(t=>`<li>${escape(t.test_name)} — ${escape(t.status)}</li>`).join('')}</ul>` : ''}<h2>All steps</h2><table><thead><tr><th>Step</th><th>Test / action</th><th>Status</th><th>Duration</th><th>Finding / recommendation</th></tr></thead><tbody>${r.steps.map(row).join('')}</tbody></table></main></body></html>`;
}

export function downloadDesktopReport(run, format) {
  const html = format === 'html';
  const blob = new Blob([html ? desktopReportHtml(run) : JSON.stringify(desktopReport(run), null, 2)], {type:html ? 'text/html;charset=utf-8' : 'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `desktop-report-${String(run.id || 'run').replace(/[^a-zA-Z0-9_-]/g, '_')}.${html ? 'html' : 'json'}`;
  document.body.appendChild(link);
  link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
