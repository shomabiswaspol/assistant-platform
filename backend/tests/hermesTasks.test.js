import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { EventEmitter } from 'events';
import { configured, callFazleCoreTasksRaw } from '../src/routes/hermesTasks.js';
import { config } from '../src/config.js';

// Same http.request-mocking approach as fazleOps.test.js (hermesTasks.js
// reuses the identical raw-http-over-fetch pattern for the same documented
// TLS-quirk reason -- see that file's own comment).

function fakeHttpRequest({ statusCode = 200, body = '{}' } = {}) {
  return (_options, callback) => {
    const upstream = new EventEmitter();
    const req = new EventEmitter();
    req.write = () => {};
    req.end = () => {
      callback({ statusCode, on: upstream.on.bind(upstream) });
      upstream.emit('data', Buffer.from(body));
      upstream.emit('end');
    };
    req.destroy = () => {};
    return req;
  };
}

describe('hermesTasks configured()', () => {
  test('true when both fazleCoreTasksUrl and fazleCoreInternalApiKey are set', () => {
    assert.equal(configured(), Boolean(config.fazleCoreTasksUrl && config.fazleCoreInternalApiKey));
  });
});

describe('callFazleCoreTasksRaw', () => {
  let originalRequest;

  beforeEach(() => { originalRequest = http.request; });
  afterEach(() => { http.request = originalRequest; });

  test('requests the correct suffix path under fazleCoreTasksUrl', async () => {
    const calls = [];
    http.request = (options, callback) => {
      calls.push(options);
      return fakeHttpRequest({ body: '{"tasks":[]}' })(options, callback);
    };

    const { status, data } = await callFazleCoreTasksRaw('tasks');

    assert.equal(calls.length, 1);
    const base = new URL(config.fazleCoreTasksUrl);
    assert.equal(calls[0].path, `${base.pathname}tasks`);
    assert.equal(status, 200);
    assert.deepEqual(data, { tasks: [] });
  });

  test('sets X-Internal-Key and Host headers', async () => {
    let capturedOptions;
    http.request = (options, callback) => {
      capturedOptions = options;
      return fakeHttpRequest()(options, callback);
    };

    await callFazleCoreTasksRaw('tasks');

    assert.equal(capturedOptions.headers['X-Internal-Key'], config.fazleCoreInternalApiKey);
    assert.equal(capturedOptions.headers.Host, 'assistant.iamazim.com');
  });

  test('POST with jsonBody sets Content-Type/Length and writes the payload', async () => {
    let capturedOptions;
    let capturedBody = '';
    http.request = (options, callback) => {
      capturedOptions = options;
      const upstream = new EventEmitter();
      const req = new EventEmitter();
      req.write = (chunk) => { capturedBody += chunk; };
      req.end = () => {
        callback({ statusCode: 200, on: upstream.on.bind(upstream) });
        upstream.emit('data', Buffer.from('{"ok":true}'));
        upstream.emit('end');
      };
      req.destroy = () => {};
      return req;
    };

    await callFazleCoreTasksRaw('actions/7/reject', { method: 'POST', jsonBody: { reason: 'not needed' } });

    assert.equal(capturedOptions.method, 'POST');
    assert.equal(capturedOptions.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(capturedBody), { reason: 'not needed' });
  });

  test('GET with no jsonBody sends no body / no Content-Type', async () => {
    let capturedOptions;
    http.request = (options, callback) => {
      capturedOptions = options;
      return fakeHttpRequest()(options, callback);
    };

    await callFazleCoreTasksRaw('tasks/5');

    assert.equal(capturedOptions.headers['Content-Type'], undefined);
  });

  test('non-200 upstream status is passed through unchanged', async () => {
    http.request = fakeHttpRequest({ statusCode: 400, body: '{"detail":"task #5 is DONE"}' });

    const { status, data } = await callFazleCoreTasksRaw('tasks/5/authorize-build', { method: 'POST' });

    assert.equal(status, 400);
    assert.deepEqual(data, { detail: 'task #5 is DONE' });
  });

  test('network error resolves 502 rather than throwing', async () => {
    http.request = () => {
      const req = new EventEmitter();
      req.write = () => {};
      req.end = () => { req.emit('error', new Error('connection refused')); };
      req.destroy = () => {};
      return req;
    };

    const { status, data } = await callFazleCoreTasksRaw('tasks');

    assert.equal(status, 502);
    assert.ok(data.error);
  });
});
