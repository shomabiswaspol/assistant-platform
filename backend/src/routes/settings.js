import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { encryptSecret } from '../utils/encryption.js';
import { config } from '../config.js';

const router = Router();
router.use(requireAuth);

// --- Model / provider list (static for now — mirrors omniroute/config.yml's
// priority tiers so the UI can show them before OmniRoute itself is live) ---
router.get('/models', (_req, res) => {
  res.json({
    priority_1_free: ['groq/llama-3.3-70b-versatile', 'groq/llama-3.1-8b-instant', 'google/gemini-2.0-flash'],
    priority_2_local: ['ollama/phi4-mini', 'ollama/qwen3:8b'],
    priority_3_paid: ['moonshot/kimi-k3', 'deepseek/deepseek-chat'],
  });
});

// --- User's own API keys (encrypted at rest) ---
router.get('/api-keys', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, provider, label, is_active, last_used, created_at FROM user_api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user.sub]
  );
  res.json(rows); // never returns encrypted_key
});

router.post('/api-keys', async (req, res) => {
  const { provider, key, label } = req.body || {};
  if (!provider || !key) return res.status(400).json({ error: 'provider and key required' });
  const encrypted = encryptSecret(key);
  const { rows } = await pool.query(
    `INSERT INTO user_api_keys (user_id, provider, encrypted_key, label) VALUES ($1, $2, $3, $4)
     RETURNING id, provider, label, is_active, created_at`,
    [req.user.sub, provider, encrypted, label || null]
  );
  res.status(201).json(rows[0]);
});

router.delete('/api-keys/:id', async (req, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM user_api_keys WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.sub]
  );
  if (!rowCount) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// --- OmniRoute status (not start/stop — see note in final report: this
// backend does not have host-level permission to control the sibling
// omniroute container; it can only report reachability) ---
router.get('/omniroute-status', async (_req, res) => {
  // tavilyConfigured: boolean presence check only, never the key value —
  // same pattern as fazleBridgeEnabled() in db.js. Piggybacked on this
  // existing status endpoint (already polled by SettingsPage) rather than
  // adding a new route for one boolean.
  const tavilyConfigured = !!process.env.TAVILY_API_KEY;
  try {
    const r = await fetch(`${config.omnirouteUrl}/models`, {
      signal: AbortSignal.timeout(3000),
      headers: config.omnirouteApiKey ? { Authorization: `Bearer ${config.omnirouteApiKey}` } : {},
    });
    res.json({ reachable: r.ok, status: r.status, tavilyConfigured });
  } catch (err) {
    res.json({ reachable: false, error: String(err), tavilyConfigured });
  }
});

export default router;
