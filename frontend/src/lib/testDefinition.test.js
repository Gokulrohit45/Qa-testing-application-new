import test from 'node:test';
import assert from 'node:assert/strict';
import {csvRows, parseTestCsv, variableNames, SAMPLE_CSV} from './testDefinition.js';

test('legacy action/target remain structured, including Open and upload file', () => {
  const [{steps}] = parseTestCsv('Step,Action,Target,Value/Exp\n1,verify,Open incidents,\n2,fill,Password,open upload_file\n3,upload_file,file,sales.xlsx\n4,wait,10,');
  assert.equal(steps[0].action, 'verify');
  assert.equal(steps[0].target, 'Open incidents');
  assert.equal(steps[1].value, 'open upload_file');
  assert.equal(steps[2].value, 'sales.xlsx');
  assert.equal(steps[2].target, "input[type='file']");
  assert.equal(steps[3].value, '10000');
});
test('quoted commas, escaped quotes, BOM and multiline fields', () => {
  assert.deepEqual(csvRows('\uFEFFAction,Target,Value\r\nfill,Notes,"A, B ""quoted""\nline"'), [['Action','Target','Value'],['fill','Notes','A, B "quoted"\nline']]);
  assert.throws(() => csvRows('Action,Target\nclick,"oops'), /unclosed/);
  assert.throws(() => csvRows('Action,Target\nclick,"x"bad'), /Unexpected/);
});
test('sample variables and outcomes survive import', () => {
  const [{steps}] = parseTestCsv(SAMPLE_CSV);
  assert.deepEqual(variableNames(steps), ['test_email','test_password']);
  assert.equal(steps[3].expected_value, 'Overview');
  assert.deepEqual(steps[3].depends_on, [2,3]);
  assert.equal(steps[3].critical, true);
});
test('test cases are separated and numbered independently', () => {
  assert.equal(parseTestCsv('Test Case,Step,Action,Target\nA,1,click,Login\nB,1,verify,Sign In').length, 2);
  assert.throws(() => parseTestCsv('Step,Action,Target\n2,click,Login'), /consecutive/);
});
test('unsupported actions and ambiguous expected prose are rejected', () => {
  assert.throws(() => parseTestCsv('Step,Action,Target\n1,power_on,ESP32'), /Unsupported/);
  assert.throws(() => parseTestCsv('Action,Target,Expected\nclick,Login,works properly'), /Expected Type/);
});
test('new waits are seconds; literal minus is not removed from Value', () => {
  const [{steps}] = parseTestCsv('Action,Target,Value\nfill,Notes,-\nwait,,120');
  assert.equal(steps[0].value, '-');
  assert.equal(steps[1].value, '120000');
});
test('misspelled expectation columns cannot silently disappear', () => {
  assert.throws(() => parseTestCsv('Action,Target,Expected Result\nclick,Save,Success'), /Unknown CSV/);
});
test('structured input whitespace and punctuation are preserved', () => {
  const [{steps}] = parseTestCsv('Action,Target,Value\nfill,Notes,"  O\'Brien, test  "');
  assert.equal(steps[0].value, "  O'Brien, test  ");
});
