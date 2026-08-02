import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { config } from '../config.js';

const router = Router();
// Full-capability Hermes (real terminal/file/code_execution access via
// hermes-runner.service) — admin-only, not just requireApproved.
router.use(requireAuth, requireAdmin);

router.get('/messages', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, role, content, created_at FROM hermes_messages WHERE user_id = $1 ORDER BY created_at ASC`,
    [req.user.sub]
  );
  res.json(rows);
});

router.post('/send', async (req, res) => {
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });

  await pool.query(
    `INSERT INTO hermes_messages (user_id, role, content) VALUES ($1, 'user', $2)`,
    [req.user.sub, message]
  );

  const { rows: stateRows } = await pool.query(
    'SELECT hermes_session_id FROM hermes_state WHERE user_id = $1',
    [req.user.sub]
  );
  const hermesSessionId = stateRows[0]?.hermes_session_id || null;

  let upstream;
  try {
    upstream = await fetch(`${config.hermesRunnerUrl}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.hermesRunnerSecret}`,
      },
      body: JSON.stringify({ hermes_session_id: hermesSessionId, message }),
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
  // through, and losing track of it would orphan the conversation.
  if (data.hermes_session_id && data.hermes_session_id !== hermesSessionId) {
    await pool.query(
      `INSERT INTO hermes_state (user_id, hermes_session_id, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET hermes_session_id = EXCLUDED.hermes_session_id, updated_at = NOW()`,
      [req.user.sub, data.hermes_session_id]
    );
  }

  if (!upstream.ok) {
    return res.status(502).json({ error: data.error || 'Hermes runner error' });
  }

  await pool.query(
    `INSERT INTO hermes_messages (user_id, role, content) VALUES ($1, 'assistant', $2)`,
    [req.user.sub, data.reply]
  );

  res.json({ reply: data.reply });
});

router.post('/reset', async (req, res) => {
  await pool.query('DELETE FROM hermes_messages WHERE user_id = $1', [req.user.sub]);
  await pool.query('DELETE FROM hermes_state WHERE user_id = $1', [req.user.sub]);
  res.json({ ok: true });
});

export default router;
