import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { config } from '../config.js';

const router = Router();
// Full-capability Hermes (real terminal/file/code_execution access via
// hermes-runner.service) — admin-only, not just requireApproved.
router.use(requireAuth, requireAdmin);

// Mirrored (not read from ~/.hermes/config.yaml at runtime) from the
// agent.personalities map there, same list hermes-runner/server.py's
// PERSONAS dict uses — kept as static duplicates on purpose, matching this
// project's existing pattern of duplicating fazle-core query logic across
// fazleTools.js/fazleBridge.js rather than one process calling the other.
// Update both places if ~/.hermes/config.yaml's personas change.
const PERSONAS = [
  { key: 'helpful', label: 'Helpful (default)' },
  { key: 'concise', label: 'Concise' },
  { key: 'technical', label: 'Technical' },
  { key: 'creative', label: 'Creative' },
  { key: 'teacher', label: 'Teacher' },
  { key: 'kawaii', label: 'Kawaii' },
  { key: 'catgirl', label: 'Catgirl' },
  { key: 'pirate', label: 'Pirate' },
  { key: 'shakespeare', label: 'Shakespeare' },
  { key: 'surfer', label: 'Surfer' },
  { key: 'noir', label: 'Noir' },
  { key: 'uwu', label: 'UwU' },
  { key: 'philosopher', label: 'Philosopher' },
  { key: 'hype', label: 'Hype' },
];
const PERSONA_KEYS = new Set(PERSONAS.map((p) => p.key));
const DEFAULT_PERSONA = 'helpful';

router.get('/personas', (_req, res) => res.json(PERSONAS));

// Current session's persona + whether it's locked (persona is chosen once
// per session, not per-message — the frontend disables the picker once a
// Hermes session already exists).
router.get('/state', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT hermes_session_id, persona FROM hermes_state WHERE user_id = $1',
    [req.user.sub]
  );
  res.json({ persona: rows[0]?.persona || DEFAULT_PERSONA, locked: !!rows[0]?.hermes_session_id });
});

// Capability mode gate (READ/BUILD/RUN) — proxies straight to
// hermes-runner.service, which owns the actual mode file and enforcement
// (see current_mode.txt, MODE_TOOLSETS in server.py). This route only
// relays; it holds no state of its own, so there's nothing here to drift
// out of sync with what Hermes is actually enforcing.
router.get('/mode', async (_req, res) => {
  try {
    const upstream = await fetch(`${config.hermesRunnerUrl}/mode`, {
      headers: { Authorization: `Bearer ${config.hermesRunnerSecret}` },
      signal: AbortSignal.timeout(5000),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return res.status(502).json({ error: data.error || 'Hermes runner error' });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Hermes runner unreachable' });
  }
});

router.post('/mode', async (req, res) => {
  // ttl_seconds/scope (Task 6, 2026-08-04): optional time-bounded mode
  // elevation. Validation itself lives entirely in hermes-runner
  // (write_mode_state) — this route only relays, same as before.
  const { mode, ttl_seconds: ttlSeconds, scope } = req.body || {};
  try {
    const upstream = await fetch(`${config.hermesRunnerUrl}/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.hermesRunnerSecret}` },
      body: JSON.stringify({ mode, ttl_seconds: ttlSeconds, scope }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return res.status(upstream.status === 400 ? 400 : 502).json({ error: data.error || 'Hermes runner error' });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Hermes runner unreachable' });
  }
});

router.get('/messages', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, role, content, created_at FROM hermes_messages WHERE user_id = $1 ORDER BY created_at ASC`,
    [req.user.sub]
  );
  res.json(rows);
});

router.post('/send', async (req, res) => {
  const { message, persona } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });

  await pool.query(
    `INSERT INTO hermes_messages (user_id, role, content) VALUES ($1, 'user', $2)`,
    [req.user.sub, message]
  );

  const { rows: stateRows } = await pool.query(
    'SELECT hermes_session_id, persona FROM hermes_state WHERE user_id = $1',
    [req.user.sub]
  );
  const hermesSessionId = stateRows[0]?.hermes_session_id || null;
  // Persona is only settable when there's no existing session — once a
  // session exists, its stored persona wins regardless of what's passed in,
  // so it can't silently change mid-conversation.
  const activePersona = hermesSessionId
    ? stateRows[0]?.persona || DEFAULT_PERSONA
    : PERSONA_KEYS.has(persona) ? persona : DEFAULT_PERSONA;

  let upstream;
  try {
    upstream = await fetch(`${config.hermesRunnerUrl}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.hermesRunnerSecret}`,
      },
      body: JSON.stringify({ hermes_session_id: hermesSessionId, message, persona: activePersona }),
      // Hermes agentic tool loops can run long — generous timeout, matches
      // hermes-runner's own internal HERMES_RUN_TIMEOUT (170s) with a
      // little headroom for the network hop itself.
      signal: AbortSignal.timeout(180000),
    });
  } catch (err) {
    return res.status(502).json({ error: 'Hermes runner unreachable', detail: String(err) });
  }

  const data = await upstream.json().catch(() => ({}));

  // Persist whatever session id we got back even on failure — the runner
  // may have created a new Hermes session before hitting an error partway
  // through, and losing track of it would orphan the conversation. Only
  // fires on session creation (id changed from null), which is exactly
  // when the persona choice needs to be saved for the rest of the session.
  if (data.hermes_session_id && data.hermes_session_id !== hermesSessionId) {
    await pool.query(
      `INSERT INTO hermes_state (user_id, hermes_session_id, persona, updated_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE SET hermes_session_id = EXCLUDED.hermes_session_id, persona = EXCLUDED.persona, updated_at = NOW()`,
      [req.user.sub, data.hermes_session_id, activePersona]
    );
  }

  if (!upstream.ok) {
    return res.status(502).json({ error: data.error || 'Hermes runner error' });
  }

  await pool.query(
    `INSERT INTO hermes_messages (user_id, role, content) VALUES ($1, 'assistant', $2)`,
    [req.user.sub, data.reply]
  );

  res.json({ reply: data.reply, mode: data.mode });
});

router.post('/reset', async (req, res) => {
  await pool.query('DELETE FROM hermes_messages WHERE user_id = $1', [req.user.sub]);
  await pool.query('DELETE FROM hermes_state WHERE user_id = $1', [req.user.sub]);
  res.json({ ok: true });
});

export default router;
