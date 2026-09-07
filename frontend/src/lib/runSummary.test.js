import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRun } from './runSummary.js';

test('empty and partial runs never report success', () => {
  assert.equal(summarizeRun([], 'Passed').displayStatus, 'No results');
  assert.equal(summarizeRun([], 'Passed').successRate, 0);
  assert.equal(summarizeRun([{status:'passed'}], 'Running').complete, false);
  assert.equal(summarizeRun([{status:'passed'}], 'Stopped').displayStatus, 'Run stopped');
  assert.equal(summarizeRun([{status:'passed'}, {status:'skipped'}], 'Passed').displayStatus, 'Run incomplete');
});
test('action-only success is distinguished from checked outcomes', () => {
  assert.equal(summarizeRun([{status:'passed'}], 'Passed').displayStatus, 'Actions passed — no outcome checks');
  assert.equal(summarizeRun([{status:'passed', assertion_status:'passed'}], 'Passed').displayStatus, 'Tests passed');
  assert.equal(summarizeRun([{status:'failed'}], 'Passed').displayStatus, 'Tests failed');
});
