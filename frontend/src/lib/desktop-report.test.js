import test from 'node:test';
import assert from 'node:assert/strict';
import {desktopReport, desktopReportHtml} from './desktop-report.js';

test('report includes every outcome without test inputs or window identity', () => {
  const report = desktopReport({id:'run',status:'cancelled',handle:42,user_id:'private',steps:[
    {step_number:1,action:'fill',status:'passed',value:'SECRET',target:{name:'PRIVATE'}},
    {step_number:2,action:'verify_text',status:'failed',error:'Mismatch',recommendation:'Check expectation'},
    {step_number:3,action:'click',status:'not_completed'}]});
  assert.equal(report.steps.length,3);
  assert.equal(report.assertion_count,1);
  assert.deepEqual(report.counts,{passed:1,failed:1,not_completed:1});
  assert.equal(report.status,'cancelled');
  for (const word of ['SECRET','PRIVATE','handle','user_id']) assert.ok(!JSON.stringify(report).includes(word));
  assert.equal(report.steps[1].recommendation,'Check expectation');
});
test('HTML escapes names and diagnostics and blocks active content', () => {
  const html=desktopReportHtml({test_name:'<script>alert(1)</script>',steps:[{error:'<img src=x onerror=alert(1)>',action:'click',status:'failed'}]});
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes("default-src 'none'"));
});
test('empty and action-only reports do not invent assertions or a pass', () => {
  assert.equal(desktopReport({steps:[]}).status,undefined);
  assert.equal(desktopReport({steps:[{action:'fill',status:'passed'}]}).assertion_count,0);
});
