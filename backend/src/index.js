import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { pool } from './db.js';

import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import profileRoutes from './routes/profile.js';
import settingsRoutes from './routes/settings.js';
import usageRoutes from './routes/usage.js';
import fazleBridgeRoutes from './routes/fazleBridge.js';
import chatRoutes from './routes/chat.js';
import opencodeRoutes from './routes/opencode.js';
import hermesRoutes from './routes/hermes.js';
import fazleOpsRoutes from './routes/fazleOps.js';
import hermesTasksRoutes from './routes/hermesTasks.js';

const app = express();
// nginx reverse-proxies every request to this container (see
// /etc/nginx/sites-available/assistant.iamazim.com) — trust exactly that one
// proxy hop so express-rate-limit can read X-Forwarded-For correctly instead
// of throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every request.
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const apiLimiter = rateLimit({ windowMs: 60_000, max: 120 });
app.use('/api/', apiLimiter);

app.get('/health', (_req, res) => res.json({ ok: true, service: 'assistant-backend' }));
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'assistant-backend' }));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/fazle', fazleBridgeRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/opencode', opencodeRoutes);
app.use('/api/hermes', hermesRoutes);
app.use('/api/fazle-ops', fazleOpsRoutes);
app.use('/api/hermes-tasks', hermesTasksRoutes);

app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error('unhandled error:', err);
  res.status(500).json({ error: 'internal server error' });
});

async function ensureAdminUser() {
  if (!config.admin.email || !config.admin.password) return;
  const { rows } = await pool.query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['admin']);
  if (rows.length > 0) return;
  const hash = await bcrypt.hash(config.admin.password, 12);
  await pool.query(
    `INSERT INTO users (username, email, password_hash, role, status)
     VALUES ($1, $2, $3, 'admin', 'approved') ON CONFLICT (username) DO NOTHING`,
    [config.admin.username, config.admin.email, hash]
  );
  // eslint-disable-next-line no-console
  console.log(`bootstrap admin ensured: ${config.admin.username}`);
}

async function start() {
  await ensureAdminUser();
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`assistant-backend listening on :${config.port}`);
  });
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('startup failed:', err);
  process.exit(1);
});
