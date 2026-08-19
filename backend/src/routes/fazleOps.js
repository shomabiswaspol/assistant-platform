import http from 'http';
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
// The flag names are a closed allowlist here (not an arbitrary
// {featureName} passthrough) so this panel can never be used to flip an
// unrelated flag in fazle-core's assistant_feature_flags table.
//
// 2026-08-17: added the 4 flags from the Hermes-only-AI-architecture
// session (Owner-directed) so they're self-service ON/OFF from this same
// panel instead of needing a direct DB/API call every time:
//   hermes_customer_kb_fallback  — modules.knowledge_base.get_reply()'s
//     RAG-semantic fallback (was the one ungated app.ollama call site)
//   hermes_customer_social       — modules.social_auto_reply's
//     _polish_with_ai() (Messenger/FB comments)
//   hermes_admin_console         — Admin AI Console / "Chat Lab"
//     (WhatsApp "AI <question>" command + HTTP /chat/message, both
//     surfaces, per Owner confirmation)
// All four ship OFF by default, same rollout discipline as the original
// four below.
//
// 2026-08-19: removed `hermes_intent_classification` from this allowlist
// (Owner-directed, after a dependency audit found it was never actually a
// dead-cleanup flag but an unimplemented one — it was meant to gate
// app.llm.classify_intent_llm()'s WhatsApp intent-classification step
// through Earth/Hermes instead of its current Ollama->Groq->GitHub-models
// chain, but that substitution was never written anywhere in fazle-core;
// grep across core/fazle-mcp/hermes-runner for the flag name came back
// empty). Deliberately deferred to a later, separately-scoped "route
// classify_intent_llm() through Earth" phase rather than built here — see
// project_hermes_earth_rename_autonomy_20260819 memory. The DB row itself
// is kill-switched off in the same change (see core's preflight_guard ops
// endpoint), not deleted -- reversible if that later phase picks it back up.
const HERMES_CUSTOMER_FLAGS = [
  'hermes_customer_employee',
  'hermes_customer_recruitment',
  'hermes_customer_route_b',
  'hermes_customer_general',
  'hermes_customer_kb_fallback',
  'hermes_customer_social',
  'hermes_admin_console',
];

// Named exports (2026-08-16) alongside the existing `export default router`
// below -- lets tests exercise the real request-shaping/allowlist logic
// directly (mocking Node's http.request, matching this file's own
// documented reason for using it over fetch()) instead of only being able
// to test through a live server. No change to runtime behavior.
export { HERMES_CUSTOMER_FLAGS, configured, callFazleCoreRaw };

function configured() {
  return Boolean(config.fazleCoreOpsUrl && config.fazleCoreInternalApiKey);
}

// 2026-08-12 (networking fix): uses Node's raw http module, NOT the
// global fetch() -- undici's fetch() was found, by direct testing inside
// this exact container, to fail with a TLS handshake error
// (ERR_TLS_CERT_ALTNAME_INVALID) against this internal nginx target even
// for a plain http:// URL, while http.request() against the identical
// host:port:path succeeds cleanly. Root cause not fully chased down
// (undici-specific quirk on this Node/Alpine combination, not a
// certificate or network issue -- the same raw request over http.request
// works first try). If fetch()-based calls elsewhere in this backend
// (e.g. hermesRunnerUrl in routes/hermes.js) ever show similar
// unexplained failures against this same internal nginx target, this is
// the first thing to check.
//
// Also sets an explicit Host header: fazleCoreOpsUrl points at this
// container's own Docker-network gateway IP (172.25.0.1), not the
// "assistant.iamazim.com" hostname nginx's server_name matches on --
// without Host set explicitly, nginx's name-based virtual host routing
// doesn't select the right server block and the request falls through to
// nginx's default site instead of the internal-only location that
// actually proxies to fazle-core.
function callFazleCoreRaw(suffixPath, { method = 'GET' } = {}) {
  return new Promise((resolve) => {
    const base = new URL(config.fazleCoreOpsUrl); // e.g. http://172.25.0.1:80/fazle-ops-internal
    const options = {
      hostname: base.hostname,
      port: base.port || 80,
      path: `${base.pathname}${suffixPath}`,
      method,
      headers: {
        'X-Internal-Key': config.fazleCoreInternalApiKey,
        Host: 'assistant.iamazim.com',
      },
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
    req.on('timeout', () => { req.destroy(); resolve({ status: 502, data: { error: 'fazle-core ops bridge timed out' } }); });
    req.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('fazleOps call failed:', err.message);
      resolve({ status: 502, data: { error: 'fazle-core ops bridge call failed' } });
    });
    req.end();
  });
}

async function callFazleCore(res, suffixPath, { method = 'GET' } = {}) {
  if (!configured()) {
    return res.status(503).json({
      error: 'fazle-core ops bridge not configured',
      hint: 'set FAZLE_CORE_INTERNAL_API_KEY in backend/.env',
    });
  }
  const { status, data } = await callFazleCoreRaw(suffixPath, { method });
  return res.status(status).json(data);
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
  const { status, data } = await callFazleCoreRaw('/flags');
  const allFlags = Array.isArray(data.flags) ? data.flags : [];
  const known = new Map(allFlags.map((f) => [f.feature_name, f]));
  const flags = HERMES_CUSTOMER_FLAGS.map(
    (name) => known.get(name) || { feature_name: name, is_active: false, kill_switch_active: false, effective_enabled: false },
  );
  return res.status(status).json({ ok: status >= 200 && status < 300, flags });
});

router.post('/activate/:name', (req, res) => {
  if (!HERMES_CUSTOMER_FLAGS.includes(req.params.name)) {
    return res.status(404).json({ error: `unknown flag: ${req.params.name}` });
  }
  return callFazleCore(res, `/activate/${req.params.name}`, { method: 'POST' });
});

router.post('/kill-switch/:name', (req, res) => {
  if (!HERMES_CUSTOMER_FLAGS.includes(req.params.name)) {
    return res.status(404).json({ error: `unknown flag: ${req.params.name}` });
  }
  return callFazleCore(res, `/kill-switch/${req.params.name}`, { method: 'POST' });
});

// 2026-08-16 (operational visibility) — thin read-only passthroughs to the
// two new fazle-core endpoints added in the SAME already-open
// /api/assistant/ops/ namespace (modules/preflight_guard/routes.py:
// ops_health_summary, ops_dlq_status) specifically so no new nginx
// location or widened allowlist was needed — see that file's own comment
// for the full rationale. No new logic here, just the same
// callFazleCore() helper every route above already uses.
router.get('/health', (_req, res) => callFazleCore(res, '/health'));
router.get('/dlq', (_req, res) => callFazleCore(res, '/dlq'));

export default router;
