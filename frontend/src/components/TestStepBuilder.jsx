import React, { useState } from 'react';
import { ACTIONS, EXPECTATIONS } from '../lib/testDefinition';

export default function TestStepBuilder({ steps, onChange }) {
  const [editingIndex, setEditingIndex] = useState(null);
  const [draft, setDraft] = useState({ action: 'click', target: '', value: '', expected_type: '', expected_value: '', expected_target: '', critical: false });
  const field = (key, label, options) => <label className="text-xs text-secondary space-y-1" key={key}>{label}
    {options ? <select aria-label={label} className="input-field" value={draft[key]} onChange={e => setDraft({...draft, [key]: e.target.value})}>{options.map(v => <option value={v} key={v}>{v || 'No check'}</option>)}</select>
    : <input aria-label={label} autoComplete="off" type={key === 'value' && /password|secret|token/i.test(draft.target) ? 'password' : 'text'} className="input-field" value={draft[key]} onChange={e => setDraft({...draft, [key]: e.target.value})} />}</label>;
  return <div className="space-y-3 border border-indigo-500/30 rounded-lg p-3">
    <p className="text-sm font-semibold text-primary">Structured step builder</p>
    <p className="text-xs text-secondary">Targets: visible label, role:button:Save, testid:save, or css:#save. Wait values here are milliseconds. Select uses the visible option label. Expectations check exact field/option values; text_visible checks visible text containing the value.</p>
    <div className="grid grid-cols-2 gap-2">{field('action', 'Action', ACTIONS)}{field('target', 'Target')}{field('value', 'Input value')}{field('expected_type', 'Expected type', ['', ...EXPECTATIONS])}{field('expected_value', 'Expected value')}{field('expected_target', 'Expected target (optional)')}</div>
    <label className="text-xs text-secondary flex gap-2"><input type="checkbox" checked={draft.critical} onChange={e => setDraft({...draft, critical: e.target.checked})}/>Critical: block the rest of this test if this step fails</label>
    <button type="button" className="btn-ghost text-xs" onClick={() => { onChange(editingIndex === null ? [...steps, {...draft}] : steps.map((s, i) => i === editingIndex ? {...s, ...draft} : s)); setEditingIndex(null); setDraft({...draft, target: '', value: '', expected_value: '', expected_target: ''}); }}>{editingIndex === null ? 'Add step' : 'Apply step edit'}</button>
    <ol className="max-h-64 overflow-auto space-y-2">{steps.map((step, i) => <li key={i} className="text-xs text-secondary border-b border-indigo-500/20 pb-2 flex gap-2">
      <span className="min-w-0 break-words flex-1">{i+1}. {step.action} — {step.target || 'wait'} {step.expected_type ? `→ ${step.expected_type}: ${step.expected_type === 'field_value' ? '[value check]' : step.expected_value}` : ''}</span>
      <button type="button" onClick={() => {setEditingIndex(i); setDraft({action: step.action, target: step.target || '', value: step.value || '', expected_type: step.expected_type || '', expected_value: step.expected_value || '', expected_target: step.expected_target || '', critical: !!step.critical});}}>Edit</button>
      <button type="button" onClick={() => { if (steps.some(s => s.depends_on?.length)) { alert('This test has explicit dependencies. Edit step numbering in the CSV before removing steps.'); return; } onChange(steps.filter((_, n) => n !== i)); }}>Remove</button>
    </li>)}</ol>
  </div>;
}
