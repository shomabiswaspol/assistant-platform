import { Router } from 'express';
import { getFazleReaderPool } from '../db.js';
import { requireAuth, requireApproved } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireApproved);

// Read-only bridge into fazle-core's data, reusing the EXISTING
// fazle_ai_reader Postgres role (see /home/azim/core/modules/ai_readonly_tools/).
// Deliberately restricted to the same ai_read_* views fazle-core itself
// exposes to its AI console — no raw production tables, no writes, ever.
// fazle-core was not modified in any way to support this.

async function readOnlyQuery(res, sql, params = []) {
  const pool = getFazleReaderPool();
  if (!pool) {
    return res.status(503).json({
      error: 'fazle-core bridge not configured',
      hint: 'set FAZLE_AI_READER_DB_URL in backend/.env — see backend/.env.example',
    });
  }
  try {
    const { rows } = await pool.query(sql, params);
    return res.json(rows);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('fazleBridge query error:', err.message);
    return res.status(502).json({ error: 'fazle-core bridge query failed' });
  }
}

router.get('/contacts', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  return readOnlyQuery(
    res,
    'SELECT contact_id, display_name, whatsapp_number, relation, company_name FROM ai_read_contacts LIMIT $1',
    [limit]
  );
});

router.get('/employees', (req, res) => {
  const status = req.query.status === 'inactive' ? 'inactive' : 'active';
  return readOnlyQuery(
    res,
    'SELECT employee_id, employee_name, designation, status FROM ai_read_employees WHERE status = $1 ORDER BY employee_name LIMIT 100',
    [status]
  );
});

router.get('/messages', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
  return readOnlyQuery(
    res,
    'SELECT sender_number, sender_name, message_body, direction, source, received_at FROM ai_read_recent_messages ORDER BY received_at DESC LIMIT $1',
    [limit]
  );
});

router.get('/kb', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 30);
  const category = req.query.category;
  if (category) {
    return readOnlyQuery(
      res,
      'SELECT id, key, category, subcategory, content_preview FROM ai_read_kb_articles WHERE LOWER(category) LIKE $1 LIMIT $2',
      [`%${String(category).toLowerCase()}%`, limit]
    );
  }
  return readOnlyQuery(
    res,
    'SELECT id, key, category, subcategory, content_preview FROM ai_read_kb_articles LIMIT $1',
    [limit]
  );
});

export default router;
