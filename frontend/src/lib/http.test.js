import test from 'node:test';
import assert from 'node:assert/strict';
import { requestJson } from './http.js';

test('custom request headers preserve the local token and omit helper options', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.headers.get('X-QA-AI-Token'), 'test-token');
    assert.equal(options.headers.get('X-Trace'), 'test');
    assert.equal(options.timeoutMs, undefined);
    return { ok: true, json: async () => ({ ok: true }) };
  });
  assert.deepEqual(await requestJson('http://localhost/test', {headers: {'X-Trace': 'test'}}, {'X-QA-AI-Token': 'test-token'}), {ok:true});
});

test('deadline still works with a caller signal and while reading the body', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, {signal}) => ({ok:true, json: () => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('timed out')), {once:true});
  })}));
  await assert.rejects(requestJson('http://localhost/test', {timeoutMs: 10, signal: new AbortController().signal}), /timed out/);
});

test('structured HTTP errors retain status and validation details', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ok:false, status:400, text: async () => '{"error":"Invalid step"}'}));
  await assert.rejects(requestJson('http://localhost/test'), error => error.status === 400 && error.details.error === 'Invalid step');
});

test('caller cancellation reaches the actual request', async t => {
  const caller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (_url, {signal}) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('cancelled')), {once:true});
  }));
  const request = requestJson('http://localhost/test', {signal:caller.signal});
  caller.abort();
  await assert.rejects(request, /cancelled/);
});
