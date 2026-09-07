import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {testEnvironment} = createRequire(import.meta.url)('../../electron/test-environment.cjs');
const valid = {QA_AI_TEST_ENVIRONMENT:'1', QA_AI_TEST_PROJECT_REF:'test-project', QA_AI_TEST_SUPABASE_URL:'https://test-project.supabase.co', QA_AI_TEST_SUPABASE_ANON_KEY:'test-public-key-not-a-real-key', QA_AI_TEST_CLOUD_API_URL:'http://127.0.0.1:5001/api'};
test('test mode requires explicit endpoints without production fallback', () => {
  assert.equal(testEnvironment({}), null);
  assert.throws(() => testEnvironment({QA_AI_TEST_ENVIRONMENT:'1'}));
  assert.equal(testEnvironment(valid).cloudApiUrl, valid.QA_AI_TEST_CLOUD_API_URL);
});
test('test mode rejects production backend and mismatched database', () => {
  assert.throws(() => testEnvironment({...valid, QA_AI_TEST_CLOUD_API_URL:'https://qa-testing-application-new.onrender.com/api'}));
  assert.throws(() => testEnvironment({...valid, QA_AI_TEST_PROJECT_REF:'different'}));
  assert.throws(() => testEnvironment({...valid, QA_AI_TEST_CLOUD_API_URL:'http://remote.example/api'}));
});
