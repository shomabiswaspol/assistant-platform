import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { config } from '../config.js';

const router = Router();
// Admin-only (2026-08-03: was requireApproved — open to every approved
// user — until OpenCode's filesystem scope was widened back to the whole
// VPS, including fazle-core, per Owner decision. Only admin controls
// git/restart/deploy anyway, so the actual power was always meant to sit
// with admin; this just matches the gate to the access.
router.use(requireAuth, requireAdmin);

// opencode serve (host-level systemd service, see opencode-serve.service)
// exposes its own real REST API — this file proxies it rather than
// reimplementing anything. Sessions are always created pinned to the
// "omniroute" custom provider (configured in ~/.config/opencode/opencode.jsonc,
// pointed at the same OmniRoute gateway everything else in this app uses) —
// specifying the model per-prompt was tested and silently ignored by this
// opencode version; it only takes effect at session-creation time.
const OMNIROUTE_MODEL = { providerID: 'omniroute', id: 'auto' };

async function ocFetch(path, opts = {}) {
  return fetch(`${config.opencodeUrl}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    signal: AbortSignal.timeout(15000),
  });
}

router.get('/session', async (_req, res) => {
  try {
    const r = await ocFetch('/api/session');
    if (!r.ok) return res.status(502).json({ error: 'opencode unreachable' });
    const data = await r.json();
    res.json(data.data || []);
  } catch (err) {
    res.status(502).json({ error: 'opencode unreachable', detail: String(err) });
  }
});

router.post('/session', async (req, res) => {
  try {
    const r = await ocFetch('/api/session', {
      method: 'POST',
      body: JSON.stringify({ model: OMNIROUTE_MODEL }),
    });
    if (!r.ok) return res.status(502).json({ error: 'failed to create opencode session' });
    const data = await r.json();
    res.json(data.data);
  } catch (err) {
    res.status(502).json({ error: 'opencode unreachable', detail: String(err) });
  }
});

router.get('/session/:id/messages', async (req, res) => {
  try {
    const r = await ocFetch(`/api/session/${req.params.id}/message`);
    if (!r.ok) return res.status(502).json({ error: 'failed to load messages' });
    const data = await r.json();
    res.json((data.data || []).slice().reverse()); // oldest first, matches chat UI convention
  } catch (err) {
    res.status(502).json({ error: 'opencode unreachable', detail: String(err) });
  }
});

// No /session/:id/wait endpoint in this opencode version (confirmed live:
// returns ServiceUnavailableError) — poll message history instead until a
// new assistant message with `finish` set appears, or time out.
router.post('/session/:id/prompt', async (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });
  const sessionId = req.params.id;

  try {
    const before = await ocFetch(`/api/session/${sessionId}/message`);
    const beforeIds = new Set(((await before.json()).data || []).map((m) => m.id));

    const promptResp = await ocFetch(`/api/session/${sessionId}/prompt`, {
      method: 'POST',
      body: JSON.stringify({ prompt: { text } }),
    });
    if (!promptResp.ok) {
      const detail = await promptResp.text().catch(() => '');
      return res.status(502).json({ error: 'opencode rejected the prompt', detail });
    }

    // 90s measured too tight in live testing (one real reply took just
    // over it) — widened with headroom.
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      const poll = await ocFetch(`/api/session/${sessionId}/message`);
      if (!poll.ok) continue;
      const msgs = (await poll.json()).data || [];
      const reply = msgs.find((m) => m.type === 'assistant' && !beforeIds.has(m.id) && m.finish);
      if (reply) {
        const text = (reply.content || []).map((c) => c.text || '').join('');
        return res.json({ reply: text, model: reply.model, raw: reply });
      }
    }
    res.status(504).json({ error: 'opencode timed out waiting for a reply' });
  } catch (err) {
    res.status(502).json({ error: 'opencode unreachable', detail: String(err) });
  }
});

router.delete('/session/:id', async (req, res) => {
  try {
    const r = await ocFetch(`/api/session/${req.params.id}`, { method: 'DELETE' });
    res.json({ ok: r.ok });
  } catch (err) {
    res.status(502).json({ error: 'opencode unreachable', detail: String(err) });
  }
});

export default router;
