import { Router } from 'express';
import { config } from '../config.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// Hermes customer-dispatch Phase 1 (2026-08-12, Minimal Modification Plan
// item 9) — thin, admin-only passthrough to fazle-core's own
// modules.preflight_guard ops-flag endpoints. This is the ON/OFF control
// for the four hermes_customer_* feature flags (employee, recruitment,
// route_b, general) that modules.message_router/route_b/recruitment_flow
// check before substituting a Hermes-generated reply for the existing
// app.llm.generate_reply() chain — see modules/hermes_dispatch.py.
//
// Deliberately NOT part of fazleBridge.js: that file is a strict,
// documented, 3-layer READ-ONLY Postgres bridge (see its own header
// comment); this makes WRITE calls to fazle-core's FastAPI over HTTP —
// a different transport and a different safety model, so it gets its own
// file rather than diluting fazleBridge.js's own invariant.
//
// The four flag names are a closed allowlist here (not an arbitrary
// {featureName} passthrough) so this panel can never be used to flip an
// unrelated flag in fazle-core's assistant_feature_flags table.
const HERMES_CUSTOMER_FLAGS = [
  'hermes_customer_employee',
  'hermes_customer_recruitment',
  'hermes_customer_route_b',
  'hermes_customer_general',
];

function configured() {
  return Boolean(config.fazleCoreOpsUrl && config.fazleCoreInternalApiKey);
}

async function callFazleCore(res, path, { method = 'GET' } = {}) {
  if (!configured()) {
    return res.status(503).json({
      error: 'fazle-core ops bridge not configured',
      hint: 'set FAZLE_CORE_INTERNAL_API_KEY in backend/.env',
    });
  }
  try {
    const r = await fetch(`${config.fazleCoreOpsUrl}${path}`, {
      method,
      headers: { 'X-Internal-Key': config.fazleCoreInternalApiKey },
      signal: AbortSignal.timeout(10000),
    });
    const data = await r.json().catch(() => ({}));
    return res.status(r.status).json(data);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('fazleOps call failed:', err.message);
    return res.status(502).json({ error: 'fazle-core ops bridge call failed' });
  }
}

router.get('/flags', async (_req, res) => {
  if (!configured()) {
    return res.status(503).json({
      error: 'fazle-core ops bridge not configured',
      hint: 'set FAZLE_CORE_INTERNAL_API_KEY in backend/.env',
    });
  }
  // Filter fazle-core's full flag list down to just the ones this panel
  // controls — the endpoint itself (GET /api/assistant/ops/flags) has no
  // filter of its own, so this route owns the allowlist.
  try {
    const r = await fetch(`${config.fazleCoreOpsUrl}/api/assistant/ops/flags`, {
      headers: { 'X-Internal-Key': config.fazleCoreInternalApiKey },
      signal: AbortSignal.timeout(10000),
    });
    const data = await r.json().catch(() => ({}));
    const allFlags = Array.isArray(data.flags) ? data.flags : [];
    const known = new Map(allFlags.map((f) => [f.feature_name, f]));
    const flags = HERMES_CUSTOMER_FLAGS.map(
      (name) => known.get(name) || { feature_name: name, is_active: false, kill_switch_active: false, effective_enabled: false },
    );
    return res.status(r.status).json({ ok: r.ok, flags });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('fazleOps /flags failed:', err.message);
    return res.status(502).json({ error: 'fazle-core ops bridge call failed' });
  }
});

router.post('/activate/:name', (req, res) => {
  if (!HERMES_CUSTOMER_FLAGS.includes(req.params.name)) {
    return res.status(404).json({ error: `unknown flag: ${req.params.name}` });
  }
  return callFazleCore(res, `/api/assistant/ops/activate/${req.params.name}`, { method: 'POST' });
});

router.post('/kill-switch/:name', (req, res) => {
  if (!HERMES_CUSTOMER_FLAGS.includes(req.params.name)) {
    return res.status(404).json({ error: `unknown flag: ${req.params.name}` });
  }
  return callFazleCore(res, `/api/assistant/ops/kill-switch/${req.params.name}`, { method: 'POST' });
});

export default router;
