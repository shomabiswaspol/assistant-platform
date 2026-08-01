import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

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
  // Placeholder until OmniRoute exposes real per-provider free-tier quota
  // remaining (Priority 1 providers). Reports what we've consumed today
  // against free-tagged usage; real ceiling numbers come from OmniRoute later.
  const { rows } = await pool.query(
    `SELECT provider, SUM(tokens_total) AS tokens_used_today
       FROM token_usage WHERE user_id = $1 AND date = CURRENT_DATE AND is_free = true
      GROUP BY provider`,
    [req.user.sub]
  );
  res.json({ note: 'free-tier ceilings not yet wired from OmniRoute', usage_today: rows });
});

export default router;
