import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/membership-requests', async (req, res) => {
  const status = req.query.status || 'pending';
  const { rows } = await pool.query(
    `SELECT mr.id, mr.status, mr.admin_note, mr.created_at,
            u.id AS user_id, u.username, u.email, u.whatsapp_number
       FROM membership_requests mr
       JOIN users u ON u.id = mr.user_id
      WHERE mr.status = $1
      ORDER BY mr.created_at ASC`,
    [status]
  );
  res.json(rows);
});

router.post('/membership-requests/:id/decide', async (req, res) => {
  const { decision, note } = req.body || {};
  if (!['approved', 'denied'].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'approved' or 'denied'" });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const mrRes = await client.query(
      `UPDATE membership_requests
          SET status = $1, admin_note = $2, reviewed_by = $3, reviewed_at = NOW()
        WHERE id = $4 AND status = 'pending' RETURNING user_id`,
      [decision, note || null, req.user.sub, req.params.id]
    );
    if (!mrRes.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'request not found or already decided' });
    }
    await client.query('UPDATE users SET status = $1 WHERE id = $2', [decision, mrRes.rows[0].user_id]);
    await client.query('COMMIT');
    res.json({ ok: true, decision });
  } catch (err) {
    await client.query('ROLLBACK');
    // eslint-disable-next-line no-console
    console.error('membership decision error:', err);
    res.status(500).json({ error: 'failed to record decision' });
  } finally {
    client.release();
  }
});

router.get('/users', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, username, email, role, status, created_at, last_login FROM users ORDER BY created_at DESC LIMIT 200`
  );
  res.json(rows);
});

router.post('/users/:id/status', async (req, res) => {
  const { status } = req.body || {};
  if (!['approved', 'denied', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'invalid status' });
  }
  const { rows } = await pool.query(
    'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, username, status',
    [status, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'user not found' });
  res.json(rows[0]);
});

export default router;
