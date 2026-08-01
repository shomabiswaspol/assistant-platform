import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { pool } from '../db.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function issueToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role, status: user.status },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
}

router.post('/register', async (req, res) => {
  const { username, email, password, whatsapp_number } = req.body || {};
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email, password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 characters' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userRes = await client.query(
        `INSERT INTO users (username, email, password_hash, whatsapp_number, role, status)
         VALUES ($1, $2, $3, $4, 'user', 'pending') RETURNING id, username, email, role, status`,
        [username, email, hash, whatsapp_number || null]
      );
      const user = userRes.rows[0];
      await client.query(
        `INSERT INTO membership_requests (user_id, status) VALUES ($1, 'pending')`,
        [user.id]
      );
      await client.query('COMMIT');
      return res.status(201).json({
        message: 'Registration received. An admin must approve your account before you can log in.',
        user,
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'username or email already in use' });
    }
    // eslint-disable-next-line no-console
    console.error('register error:', err);
    return res.status(500).json({ error: 'registration failed' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const { rows } = await pool.query(
    `SELECT id, username, email, password_hash, role, status FROM users WHERE username = $1 OR email = $1`,
    [username]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  if (user.status === 'denied' || user.status === 'suspended') {
    return res.status(403).json({ error: `account is ${user.status}` });
  }
  if (user.status === 'pending' && user.role !== 'admin') {
    return res.status(403).json({ error: 'account is pending admin approval' });
  }
  await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
  const token = issueToken(user);
  delete user.password_hash;
  return res.json({ token, user });
});

router.post('/logout', requireAuth, (_req, res) => {
  // Stateless JWT — logout is client-side (discard token). Documented here
  // as the endpoint the frontend calls so the contract is explicit.
  res.json({ ok: true });
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  // Always return 200 regardless of whether the email exists, to avoid
  // leaking which addresses are registered.
  if (rows[0]) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await pool.query(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [rows[0].id, token, expiresAt]
    );
    if (config.smtpHost) {
      // SMTP not configured in this pass — see emailService (deferred).
    } else {
      // eslint-disable-next-line no-console
      console.log(`[password-reset] no SMTP configured — reset link for ${email}: /reset-password?token=${token}`);
    }
  }
  return res.json({ message: 'If that email is registered, a reset link has been generated.' });
});

router.post('/reset-password', async (req, res) => {
  const { token, new_password } = req.body || {};
  if (!token || !new_password) return res.status(400).json({ error: 'token and new_password required' });
  if (new_password.length < 8) return res.status(400).json({ error: 'password must be at least 8 characters' });
  const { rows } = await pool.query(
    `SELECT id, user_id FROM password_resets WHERE token = $1 AND used = false AND expires_at > NOW()`,
    [token]
  );
  if (!rows[0]) return res.status(400).json({ error: 'invalid or expired token' });
  const hash = await bcrypt.hash(new_password, 12);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, rows[0].user_id]);
  await pool.query('UPDATE password_resets SET used = true WHERE id = $1', [rows[0].id]);
  return res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, username, email, role, status, language, theme, created_at FROM users WHERE id = $1',
    [req.user.sub]
  );
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

export default router;
