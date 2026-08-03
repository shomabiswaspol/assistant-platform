import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Warn-only daily message quota, not a hard token-cost ceiling — informs the
// user, never blocks a request (Owner decision 2026-08-03). Not per-provider:
// counts every chat request today regardless of which provider served it.
const FREE_DAILY_MESSAGE_LIMIT = parseInt(process.env.FREE_DAILY_MESSAGE_LIMIT, 10) || 50;

router.get('/daily', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT date, provider, model, tokens_input, tokens_output, tokens_total, requests_count, cost, is_free
       FROM token_usage WHERE user_id = $1 AND date = CURRENT_DATE ORDER BY provider, model`,
    [req.user.sub]
  );
  res.json(rows);
});

router.get('/monthly', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT date_trunc('month', date) AS month, provider,
            SUM(tokens_total) AS tokens_total, SUM(requests_count) AS requests_count,
            SUM(cost) AS cost, BOOL_OR(is_free) AS any_free
       FROM token_usage
      WHERE user_id = $1 AND date >= date_trunc('month', CURRENT_DATE)
      GROUP BY 1, provider ORDER BY 1 DESC, provider`,
    [req.user.sub]
  );
  res.json(rows);
});

router.get('/free-remaining', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(requests_count), 0) AS messages_used_today
       FROM token_usage WHERE user_id = $1 AND date = CURRENT_DATE`,
    [req.user.sub]
  );
  const used = parseInt(rows[0].messages_used_today, 10) || 0;
  res.json({
    daily_limit: FREE_DAILY_MESSAGE_LIMIT,
    messages_used_today: used,
    messages_remaining_today: Math.max(0, FREE_DAILY_MESSAGE_LIMIT - used),
    limit_reached: used >= FREE_DAILY_MESSAGE_LIMIT,
    enforcement: 'warn_only',
  });
});

export default router;
