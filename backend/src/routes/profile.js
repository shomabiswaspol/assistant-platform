import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, username, email, whatsapp_number, profile_picture, language, theme, created_at, last_login
       FROM users WHERE id = $1`,
    [req.user.sub]
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

router.patch('/', async (req, res) => {
  const { whatsapp_number, profile_picture, language, theme } = req.body || {};
  const { rows } = await pool.query(
    `UPDATE users SET
        whatsapp_number = COALESCE($1, whatsapp_number),
        profile_picture = COALESCE($2, profile_picture),
        language = COALESCE($3, language),
        theme = COALESCE($4, theme),
        updated_at = NOW()
      WHERE id = $5
      RETURNING id, username, email, whatsapp_number, profile_picture, language, theme`,
    [whatsapp_number, profile_picture, language, theme, req.user.sub]
  );
  res.json(rows[0]);
});

router.post('/change-password', async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'current_password and new_password required' });
  }
  if (new_password.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.sub]);
  if (!rows[0] || !(await bcrypt.compare(current_password, rows[0].password_hash))) {
    return res.status(401).json({ error: 'current password incorrect' });
  }
  const hash = await bcrypt.hash(new_password, 12);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.sub]);
  res.json({ ok: true });
});

export default router;
