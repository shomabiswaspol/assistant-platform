import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireApproved } from '../middleware/auth.js';
import { config } from '../config.js';

const router = Router();
router.use(requireAuth, requireApproved);

router.get('/sessions', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, title, type, model_used, provider_used, updated_at
       FROM chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 100`,
    [req.user.sub]
  );
  res.json(rows);
});

router.get('/sessions/:id/messages', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT cm.id, cm.role, cm.content, cm.metadata, cm.model_used, cm.provider_used, cm.created_at
       FROM chat_messages cm
       JOIN chat_sessions cs ON cs.id = cm.session_id
      WHERE cm.session_id = $1 AND cs.user_id = $2
      ORDER BY cm.created_at ASC`,
    [req.params.id, req.user.sub]
  );
  res.json(rows);
});

// Rough token estimate until OmniRoute returns real usage counts on every
// provider (some free-tier providers omit usage in their response).
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

router.post('/send', async (req, res) => {
  const { session_id, message, model } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });

  let sessionId = session_id;
  if (!sessionId) {
    const { rows } = await pool.query(
      `INSERT INTO chat_sessions (user_id, title, type) VALUES ($1, $2, 'chat') RETURNING id`,
      [req.user.sub, message.slice(0, 60)]
    );
    sessionId = rows[0].id;
  }

  await pool.query(
    `INSERT INTO chat_messages (session_id, role, content, tokens_input) VALUES ($1, 'user', $2, $3)`,
    [sessionId, message, estimateTokens(message)]
  );

  let upstream;
  try {
    upstream = await fetch(`${config.omnirouteUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.omnirouteApiKey ? { Authorization: `Bearer ${config.omnirouteApiKey}` } : {}),
      },
      body: JSON.stringify({
        model: model || 'auto',
        messages: [{ role: 'user', content: message }],
        stream: false,
      }),
      signal: AbortSignal.timeout(60000),
    });
  } catch (err) {
    return res.status(502).json({
      error: 'AI gateway unreachable',
      detail: 'OmniRoute is not running yet — see the deployment report for status.',
    });
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    return res.status(502).json({ error: 'AI gateway error', status: upstream.status, detail: text });
  }

  const data = await upstream.json();
  const reply = data.choices?.[0]?.message?.content || '';
  const provider = data.provider || data.model?.split('/')?.[0] || 'unknown';
  const modelUsed = data.model || model || 'auto';
  const tokensIn = data.usage?.prompt_tokens ?? estimateTokens(message);
  const tokensOut = data.usage?.completion_tokens ?? estimateTokens(reply);

  await pool.query(
    `INSERT INTO chat_messages (session_id, role, content, tokens_output, model_used, provider_used)
     VALUES ($1, 'assistant', $2, $3, $4, $5)`,
    [sessionId, reply, tokensOut, modelUsed, provider]
  );
  await pool.query(`UPDATE chat_sessions SET updated_at = NOW(), model_used = $1, provider_used = $2 WHERE id = $3`, [
    modelUsed, provider, sessionId,
  ]);
  await pool.query(
    `INSERT INTO token_usage (user_id, date, provider, model, tokens_input, tokens_output, tokens_total, requests_count, is_free)
     VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, 1, $7)
     ON CONFLICT (user_id, date, provider, model) DO UPDATE SET
       tokens_input = token_usage.tokens_input + EXCLUDED.tokens_input,
       tokens_output = token_usage.tokens_output + EXCLUDED.tokens_output,
       tokens_total = token_usage.tokens_total + EXCLUDED.tokens_total,
       requests_count = token_usage.requests_count + 1`,
    [req.user.sub, provider, modelUsed, tokensIn, tokensOut, tokensIn + tokensOut, provider !== 'moonshot' && provider !== 'deepseek']
  );

  res.json({ session_id: sessionId, reply, model: modelUsed, provider });
});

export default router;
