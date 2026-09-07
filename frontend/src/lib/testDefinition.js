// Structured imports never pass through natural-language/AI conversion.
export const ACTIONS = ['goto', 'click', 'fill', 'wait', 'verify', 'upload_file', 'select'];
export const EXPECTATIONS = ['text_visible', 'url_contains', 'url_equals', 'field_value', 'selected_option', 'element_visible', 'element_hidden', 'element_enabled', 'element_disabled'];
export const SAMPLE_CSV = 'Test Case,Step,Action,Target,Value,Expected Type,Expected Value,Expected Target,Critical,Depends On\nLogin,1,goto,https://example.com/login,,text_visible,Sign In,,true,\nLogin,2,fill,Email address,{{test_email}},,,,false,1\nLogin,3,fill,Password,{{test_password}},,,,false,1\nLogin,4,click,Sign In,,text_visible,Overview,,true,2;3\n';

export function csvRows(text) {
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/)[0];
  const delimiter = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cell = '', quoted = false, closed = false;
  const endCell = () => { row.push(cell); cell = ''; closed = false; };
  const endRow = () => { endCell(); if (row.some(c => c.trim())) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === '"') {
      if (cell.trim() || closed) throw new Error('Malformed CSV quotation');
      cell = ''; quoted = true;
    } else if (c === delimiter) endCell();
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; endRow(); }
    else { if (closed && c.trim()) throw new Error('Unexpected text after a quoted CSV field'); cell += c; }
  }
  if (quoted) throw new Error('CSV has an unclosed quoted field');
  if (cell || row.length) endRow();
  return rows;
}

export function parseTestCsv(text, defaultName = 'Imported test') {
  const rows = csvRows(text);
  if (rows.length < 2) throw new Error('CSV needs a header and at least one step');
  const headers = rows.shift().map(h => h.trim().toLowerCase().replaceAll('_', ' '));
  const allowedHeaders = new Set(['test case', 'step', 'action', 'target', 'value', 'value/exp', 'expected type', 'expected value', 'expected target', 'critical', 'depends on', 'status', 'execution type', 'original step']);
  if (!headers.includes('action') || !headers.includes('target')) throw new Error('Required CSV headers: Action, Target');
  if (new Set(headers).size !== headers.length) throw new Error('Duplicate CSV headers');
  const legacy = headers.includes('value/exp');
  if (legacy && headers.includes('value')) throw new Error('Use Value or legacy Value/Exp, not both');
  if (headers.includes('expected')) throw new Error('Use Expected Type and Expected Value; free-form Expected prose is not executable');
  const unknownHeaders = headers.filter(h => !allowedHeaders.has(h));
  if (unknownHeaders.length) throw new Error(`Unknown CSV columns: ${unknownHeaders.join(', ')}. Use the downloadable template; expectation columns must not be silently ignored.`);
  const groups = new Map();
  rows.forEach((row, index) => {
    const fail = message => { throw new Error(`CSV row ${index + 2}: ${message}`); };
    if (row.length !== headers.length) fail('Column count differs from the header');
    const get = name => (row[headers.indexOf(name)] ?? '').trim();
    const name = get('test case') || defaultName;
    if (!groups.has(name)) groups.set(name, { name, steps: [] });
    const group = groups.get(name);
    const number = get('step') ? Number(get('step')) : group.steps.length + 1;
    if (number !== group.steps.length + 1) fail('Steps must start at 1 and be consecutive within each test case');
    const aliases = { open: 'goto', navigate: 'goto', type: 'fill', input: 'fill', press: 'click', sleep: 'wait', assert: 'verify', verify_text: 'verify' };
    const action = aliases[get('action').toLowerCase()] || get('action').toLowerCase();
    if (!ACTIONS.includes(action)) fail(`Unsupported action '${action}'`);
    let target = get('target'), value = row[headers.indexOf(legacy ? 'value/exp' : 'value')] ?? '';
    if (legacy) { if (target === '-') target = ''; if (value === '-') value = ''; }
    if (action === 'goto' && !target) { target = value; value = ''; }
    if (action === 'wait') {
      const seconds = legacy ? (target || value) : value;
      if (!/^\d+(\.\d+)?$/.test(seconds) || Number(seconds) > 300) fail('Wait requires 0–300 seconds');
      target = ''; value = String(Number(seconds) * 1000);
    }
    if (action === 'upload_file' && ['', 'file', 'dataset', 'upload'].includes(target.toLowerCase())) target = "input[type='file']";
    if (action !== 'wait' && !target) fail('Target is required');
    const expected_type = get('expected type').toLowerCase();
    if (expected_type && !EXPECTATIONS.includes(expected_type)) fail('Unsupported expected type');
    if (get('expected value') && !expected_type) fail('Expected Value requires Expected Type');
    const criticalText = get('critical').toLowerCase();
    if (criticalText && !['true', 'false'].includes(criticalText)) fail('Critical must be true or false');
    const depends_on = get('depends on') ? get('depends on').split(';').map(Number) : [];
    if (depends_on.some(n => !Number.isInteger(n) || n < 1 || n >= number)) fail('Dependencies must reference earlier steps');
    group.steps.push({action, target, value, expected_type, expected_value: get('expected value'),
      expected_target: get('expected target'), critical: criticalText === 'true', depends_on, source_row: index + 2});
  });
  return [...groups.values()];
}

export function describeSteps(steps) {
  return steps.map(s => `${s.action} ${s.target || ''}${s.action === 'fill' ? ' with' : ''} ${s.value || ''}`.trim()).join('\n');
}

export function variableNames(steps) {
  return [...new Set(steps.flatMap(s => ['target', 'value', 'expected_value', 'expected_target'].flatMap(k => [...String(s[k] ?? '').matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)].map(m => m[1]))))];
}
