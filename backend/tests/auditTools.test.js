import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { auditToolDefinitions, executeAuditTool, isAuditTool } from '../src/tools/auditTools.js';
import { config } from '../src/config.js';

// auditTools.js is a thin HTTP client over hermes-runner's /audit route (see
// its module docstring for why the logic itself can't live in this
// container). These tests stub global.fetch rather than hitting a real
// hermes-runner — matching fazleTools.test.js's approach of exercising the
// deterministic wrapper logic (URL, method, auth header, body shape, error
// handling) without depending on live infrastructure.

describe('auditToolDefinitions', () => {
  test('exposes exactly the 7 Owner-approved tools', () => {
    const names = auditToolDefinitions.map((t) => t.function.name).sort();
    assert.deepEqual(names, [
      'audit_git_status',
      'audit_read_file',
      'audit_recent_commits',
      'audit_search_code',
      'audit_search_docs',
      'audit_search_kb',
      'audit_search_logs',
    ]);
  });

  test('does not expose the DB-backed WhatsApp lookup tool (out of approved scope)', () => {
    assert.ok(!auditToolDefinitions.some((t) => t.function.name === 'audit_lookup_whatsapp_messages'));
  });

  test('every tool definition has the OpenAI function-calling shape', () => {
    for (const t of auditToolDefinitions) {
      assert.equal(t.type, 'function');
      assert.equal(typeof t.function.name, 'string');
      assert.equal(typeof t.function.description, 'string');
      assert.equal(t.function.parameters.type, 'object');
    }
  });
});

describe('isAuditTool', () => {
  test('true for a real audit tool name', () => {
    assert.equal(isAuditTool('audit_search_code'), true);
  });

  test('false for an unrelated or unknown name', () => {
    assert.equal(isAuditTool('get_contacts'), false);
    assert.equal(isAuditTool('not_a_real_tool'), false);
  });
});

describe('executeAuditTool', () => {
  let originalFetch;
  let calls;

  beforeEach(() => {
    originalFetch = global.fetch;
    calls = [];
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('unknown tool name returns a structured error without calling fetch', async () => {
    global.fetch = async (...args) => {
      calls.push(args);
      throw new Error('fetch should not have been called');
    };
    const result = await executeAuditTool('audit_delete_everything', {});
    assert.equal(typeof result.error, 'string');
    assert.equal(calls.length, 0);
  });

  test('posts to the hermes-runner /audit route with Bearer auth and the tool/args body', async () => {
    global.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return {
        ok: true,
        json: async () => ({ matches: ['line1'] }),
      };
    };
    const result = await executeAuditTool('audit_search_code', { query: 'foo', root: 'fazle-core' });

    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.endsWith('/audit'));
    assert.equal(calls[0].opts.method, 'POST');
    assert.ok(calls[0].opts.headers.Authorization.startsWith('Bearer '));
    const body = JSON.parse(calls[0].opts.body);
    assert.equal(body.tool, 'audit_search_code');
    assert.deepEqual(body.args, { query: 'foo', root: 'fazle-core' });
    assert.deepEqual(result, { matches: ['line1'] });
  });

  test('non-ok upstream response yields a structured error, not a throw', async () => {
    global.fetch = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'unknown audit tool' }),
    });
    const result = await executeAuditTool('audit_search_code', { query: 'x' });
    assert.equal(result.error, 'unknown audit tool');
  });

  test('network failure (hermes-runner unreachable) yields a structured error, not a throw', async () => {
    global.fetch = async () => {
      throw new Error('connect ECONNREFUSED');
    };
    const result = await executeAuditTool('audit_search_code', { query: 'x' });
    assert.equal(typeof result.error, 'string');
  });

  test('missing HERMES_RUNNER_SECRET short-circuits before any fetch call', async () => {
    const original = config.hermesRunnerSecret;
    config.hermesRunnerSecret = '';
    global.fetch = async (...args) => {
      calls.push(args);
      throw new Error('fetch should not have been called');
    };
    try {
      const result = await executeAuditTool('audit_search_code', { query: 'x' });
      assert.match(result.error, /not configured/);
      assert.equal(calls.length, 0);
    } finally {
      config.hermesRunnerSecret = original;
    }
  });
});
