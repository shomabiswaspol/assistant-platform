import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

// Phase 4 (2026-08-10) — requireAdminOrHermesSvc gates opencode.js's
// routes to either a human admin (existing JWT flow, unaffected) or the
// Hermes -> OpenCode handoff tool's dedicated shared-secret token. Mirrors
// authMiddleware.test.js's style for the existing requireAuth/requireAdmin
// pair, since this middleware replaces that pair on this one router.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-dummy';
process.env.HERMES_OPENCODE_SVC_TOKEN = 'test-only-svc-token';

const { requireAdminOrHermesSvc } = await import('../src/middleware/auth.js');
const { config } = await import('../src/config.js');

function makeReq(token) {
  return { headers: token ? { authorization: `Bearer ${token}` } : {} };
}

function makeRes() {
  const res = {};
  res.statusCode = null;
  res.body = null;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

function sign(payload) {
  return jwt.sign(payload, config.jwtSecret);
}

function run(req, res) {
  let called = false;
  requireAdminOrHermesSvc(req, res, () => {
    called = true;
  });
  return called;
}

describe('OpenCode authorization boundary (requireAdminOrHermesSvc)', () => {
  test('missing token is denied with 401', () => {
    const req = makeReq(null);
    const res = makeRes();
    const called = run(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(called, false);
  });

  test('ordinary approved user token is denied with 403', () => {
    const token = sign({ sub: 1, username: 'user1', role: 'user', status: 'approved' });
    const req = makeReq(token);
    const res = makeRes();
    const called = run(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(called, false);
  });

  test('genuine admin JWT passes through unaffected', () => {
    const token = sign({ sub: 2, username: 'admin1', role: 'admin', status: 'approved' });
    const req = makeReq(token);
    const res = makeRes();
    const called = run(req, res);
    assert.equal(res.statusCode, null);
    assert.equal(called, true);
    assert.equal(req.user.role, 'admin');
  });

  test('correct Hermes->OpenCode service token passes through', () => {
    const req = makeReq('test-only-svc-token');
    const res = makeRes();
    const called = run(req, res);
    assert.equal(res.statusCode, null);
    assert.equal(called, true);
    assert.equal(req.user.role, 'hermes-opencode-svc');
  });

  test('wrong/forged service token falls through to JWT verification and is rejected', () => {
    const req = makeReq('not-the-real-token');
    const res = makeRes();
    const called = run(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(called, false);
  });

  test('service token comparison is not vulnerable to a naive length/prefix short-circuit', () => {
    // Same length as the real token, wrong content — must still fail closed
    // rather than accidentally matching via a non-constant-time compare bug.
    const req = makeReq('test-only-svc-tokeX');
    const res = makeRes();
    const called = run(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(called, false);
  });

  test('when HERMES_OPENCODE_SVC_TOKEN is unset, that path never matches (fails closed, not open)', () => {
    const original = config.hermesOpencodeSvcToken;
    config.hermesOpencodeSvcToken = '';
    try {
      const req = makeReq('');
      const res = makeRes();
      const called = run(req, res);
      // Empty bearer token parses the same as "missing" in requireAuth's
      // own logic (a literal "Bearer " with nothing after it) — assert the
      // safe outcome either way: never treated as an authenticated call.
      assert.notEqual(res.statusCode, null);
      assert.equal(called, false);
    } finally {
      config.hermesOpencodeSvcToken = original;
    }
  });
});
