import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { EventEmitter } from 'events';
import { HERMES_CUSTOMER_FLAGS, configured, callFazleCoreRaw } from '../src/routes/fazleOps.js';
import { config } from '../src/config.js';

// fazleOps.js deliberately uses Node's raw http module instead of fetch()
// (see its own module comment on callFazleCoreRaw for the documented TLS
// quirk that forced this) — these tests mock http.request the same way,
// rather than global.fetch like this repo's other route tests
// (hermesPersonas.test.js, auditTools.test.js) do for their fetch()-based
// clients.

function fakeHttpRequest({ statusCode = 200, body = '{}' } = {}) {
  return (_options, callback) => {
    const upstream = new EventEmitter();
    const req = new EventEmitter();
    req.end = () => {
      callback({ statusCode, on: upstream.on.bind(upstream) });
      upstream.emit('data', Buffer.from(body));
      upstream.emit('end');
    };
    req.destroy = () => {};
    return req;
  };
}

describe('fazleOps HERMES_CUSTOMER_FLAGS allowlist', () => {
  test('is exactly the 7 flags this panel controls', () => {
    // 2026-08-17: widened from the original 4 to include 4 flags from the
    // Hermes-only-AI-architecture session (Owner-directed, explicit
    // instruction to bring them into the UI for self-service ON/OFF) —
    // see fazleOps.js's own comment on HERMES_CUSTOMER_FLAGS for what
    // each one gates. 2026-08-19: hermes_intent_classification removed
    // again — dependency audit found it was never wired to any code
    // (an unimplemented feature, not a working toggle), so this list is
    // 7, not 8.
    assert.deepEqual(HERMES_CUSTOMER_FLAGS, [
      'hermes_customer_employee',
      'hermes_customer_recruitment',
      'hermes_customer_route_b',
      'hermes_customer_general',
      'hermes_customer_kb_fallback',
      'hermes_customer_social',
      'hermes_admin_console',
    ]);
  });

  test('the three still-live new flags are present', () => {
    for (const name of [
      'hermes_customer_kb_fallback',
      'hermes_customer_social',
      'hermes_admin_console',
    ]) {
      assert.ok(HERMES_CUSTOMER_FLAGS.includes(name), `expected ${name} in allowlist`);
    }
  });

  test('hermes_intent_classification is not in the allowlist (removed 2026-08-19)', () => {
    assert.ok(!HERMES_CUSTOMER_FLAGS.includes('hermes_intent_classification'));
  });
});

describe('callFazleCoreRaw', () => {
  let originalRequest;

  beforeEach(() => {
    originalRequest = http.request;
  });

  afterEach(() => {
    http.request = originalRequest;
  });

  test('requests the correct suffix path under fazleCoreOpsUrl', async () => {
    const calls = [];
    http.request = (options, callback) => {
      calls.push(options);
      return fakeHttpRequest({ body: '{"ok":true}' })(options, callback);
    };

    const { status, data } = await callFazleCoreRaw('/health');

    assert.equal(calls.length, 1);
    const base = new URL(config.fazleCoreOpsUrl);
    assert.equal(calls[0].path, `${base.pathname}/health`);
    assert.equal(status, 200);
    assert.deepEqual(data, { ok: true });
  });

  test('sets X-Internal-Key and Host headers', async () => {
    let capturedOptions;
    http.request = (options, callback) => {
      capturedOptions = options;
      return fakeHttpRequest()(options, callback);
    };

    await callFazleCoreRaw('/dlq');

    assert.equal(capturedOptions.headers['X-Internal-Key'], config.fazleCoreInternalApiKey);
    assert.equal(capturedOptions.headers.Host, 'assistant.iamazim.com');
  });

  test('non-200 upstream status is passed through unchanged', async () => {
    http.request = fakeHttpRequest({ statusCode: 503, body: '{"error":"degraded"}' });

    const { status, data } = await callFazleCoreRaw('/health');

    assert.equal(status, 503);
    assert.deepEqual(data, { error: 'degraded' });
  });

  test('network error resolves 502 rather than throwing', async () => {
    http.request = () => {
      const req = new EventEmitter();
      req.end = () => {
        req.emit('error', new Error('connection refused'));
      };
      req.destroy = () => {};
      return req;
    };

    const { status, data } = await callFazleCoreRaw('/health');

    assert.equal(status, 502);
    assert.ok(data.error);
  });
});

describe('configured()', () => {
  test('reflects whether both fazleCoreOpsUrl and fazleCoreInternalApiKey are set', () => {
    // Both are set by default in this repo's config.js (fazleCoreOpsUrl has
    // a hardcoded default; fazleCoreInternalApiKey defaults to '' per
    // config.js's own comment about limiting blast radius) -- this just
    // asserts configured() reflects config.js's actual current state
    // rather than hardcoding an assumption about what that state is.
    const expected = Boolean(config.fazleCoreOpsUrl && config.fazleCoreInternalApiKey);
    assert.equal(configured(), expected);
  });
});
