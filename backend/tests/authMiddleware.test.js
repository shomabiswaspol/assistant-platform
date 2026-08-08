import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

// S6 — Hermes backend authorization boundary. `hermes.js` gates every route
// with `router.use(requireAuth, requireAdmin)` (see that file's comment:
// "admin-only, not just requireApproved"). These tests exercise the two
// middleware functions directly and in sequence, matching the real
// req -> requireAuth -> requireAdmin -> handler pipeline, without needing a
// live server or database.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-dummy';

const { requireAuth, requireAdmin } = await import('../src/middleware/auth.js');
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

function runChain(req, res) {
  let calls = 0;
  const next = () => {
    calls += 1;
  };
  requireAuth(req, res, () => {
    calls += 1;
    if (res.statusCode) return; // requireAuth already rejected
    requireAdmin(req, res, next);
  });
  return calls;
}

describe('Hermes admin authorization boundary (requireAuth + requireAdmin)', () => {
  test('ordinary user token is denied with 403', () => {
    const token = sign({ sub: 1, username: 'user1', role: 'user', status: 'approved' });
    const req = makeReq(token);
    const res = makeRes();
    const calls = runChain(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(calls, 1, 'handler must not run past requireAdmin rejection');
  });

  test('missing token is denied with 401 before role is ever checked', () => {
    const req = makeReq(null);
    const res = makeRes();
    runChain(req, res);
    assert.equal(res.statusCode, 401);
  });

  test('invalid/forged token is denied with 401', () => {
    const req = makeReq('not-a-real-jwt');
    const res = makeRes();
    runChain(req, res);
    assert.equal(res.statusCode, 401);
  });

  test('token signed with the wrong secret (forged role=admin claim) is rejected', () => {
    const forged = jwt.sign({ sub: 99, username: 'attacker', role: 'admin', status: 'approved' }, 'wrong-secret');
    const req = makeReq(forged);
    const res = makeRes();
    runChain(req, res);
    assert.equal(res.statusCode, 401, 'signature must be verified server-side, not trust the claim');
  });

  test('genuine admin token passes through to the handler', () => {
    const token = sign({ sub: 2, username: 'admin1', role: 'admin', status: 'approved' });
    const req = makeReq(token);
    const res = makeRes();
    const calls = runChain(req, res);
    assert.equal(res.statusCode, null, 'no rejection status set');
    assert.equal(calls, 2, 'both requireAuth and requireAdmin call next()');
  });

  test('pending/unapproved admin still passes requireAdmin (admin bypasses approval gate)', () => {
    const token = sign({ sub: 3, username: 'admin2', role: 'admin', status: 'pending' });
    const req = makeReq(token);
    const res = makeRes();
    runChain(req, res);
    assert.equal(res.statusCode, null);
  });
});
