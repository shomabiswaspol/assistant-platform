import http from 'http';
import { Router } from 'express';
import { config } from '../config.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// Minimal Owner-facing Hermes Task/Approval panel (2026-08-20, Owner-directed
// Phase 5 closure pass) — thin, admin-only passthrough to fazle-core's real
// modules.hermes_tasks routes. Same file shape/reasoning as fazleOps.js
// (raw http.request over fetch(), explicit Host header — see that file's
// own comment for the TLS-quirk rationale, identical here since this hits
// the same internal nginx target). Deliberately a closed set of routes,
// not an arbitrary path passthrough: list/get tasks, list/get actions,
// approve/reject an action. Nothing here can create a task, authorize
// BUILD, or authorize an action — this panel is read-plus-approve/reject
// only; the actual authoring of tasks/authorizations stays with Hermes
// itself (WhatsApp/web chat), matching the brief's "WhatsApp remains
// first-class, UI is secondary, never mandatory" requirement.

export { configured, callFazleCoreTasksRaw };

function configured() {
  return Boolean(config.fazleCoreTasksUrl && config.fazleCoreInternalApiKey);
}

function callFazleCoreTasksRaw(suffixPath, { method = 'GET', jsonBody } = {}) {
  return new Promise((resolve) => {
    const base = new URL(config.fazleCoreTasksUrl);
    const payload = jsonBody !== undefined ? JSON.stringify(jsonBody) : null;
    const headers = {
      'X-Internal-Key': config.fazleCoreInternalApiKey,
      Host: 'assistant.iamazim.com',
    };
    if (payload !== null) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const options = {
      hostname: base.hostname,
      port: base.port || 80,
      path: `${base.pathname}${suffixPath}`,
      method,
      headers,
      timeout: 10000,
    };
    const req = http.request(options, (upstream) => {
      let body = '';
      upstream.on('data', (chunk) => { body += chunk; });
      upstream.on('end', () => {
        let data = {};
        try { data = JSON.parse(body); } catch { /* leave {} */ }
        resolve({ status: upstream.statusCode, data });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 502, data: { error: 'fazle-core tasks bridge timed out' } }); });
    req.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('hermesTasks call failed:', err.message);
      resolve({ status: 502, data: { error: 'fazle-core tasks bridge call failed' } });
    });
    if (payload !== null) req.write(payload);
    req.end();
  });
}

async function callFazleCoreTasks(res, suffixPath, { method = 'GET', jsonBody } = {}) {
  if (!configured()) {
    return res.status(503).json({
      error: 'fazle-core tasks bridge not configured',
      hint: 'set FAZLE_CORE_INTERNAL_API_KEY in backend/.env',
    });
  }
  const { status, data } = await callFazleCoreTasksRaw(suffixPath, { method, jsonBody });
  return res.status(status).json(data);
}

// GET /api/hermes-tasks/tasks?status=IN_PROGRESS — list tasks (default: no
// filter, fazle-core's own route defaults status to undefined = all).
router.get('/tasks', (req, res) => {
  const qs = req.query.status ? `?status=${encodeURIComponent(req.query.status)}` : '';
  return callFazleCoreTasks(res, `tasks${qs}`);
});

router.get('/tasks/:id', (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'invalid task id' });
  return callFazleCoreTasks(res, `tasks/${req.params.id}`);
});

// GET /api/hermes-tasks/actions?status=pending&task_id=5 — pending
// approvals for the panel's "pending action approval" section.
router.get('/actions', (req, res) => {
  const params = new URLSearchParams();
  params.set('status', req.query.status || 'pending');
  if (req.query.task_id) params.set('task_id', req.query.task_id);
  return callFazleCoreTasks(res, `actions?${params.toString()}`);
});

router.post('/actions/:id/approve', (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'invalid action id' });
  return callFazleCoreTasks(res, `actions/${req.params.id}/approve`, { method: 'POST' });
});

router.post('/actions/:id/reject', (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'invalid action id' });
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
  return callFazleCoreTasks(res, `actions/${req.params.id}/reject`, { method: 'POST', jsonBody: { reason } });
});

export default router;
