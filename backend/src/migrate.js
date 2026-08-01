import { readFileSync } from 'fs';
import { pool } from './db.js';

const sql = readFileSync(new URL('../migrations/001_init.sql', import.meta.url), 'utf8');

try {
  await pool.query(sql);
  // eslint-disable-next-line no-console
  console.log('migrations applied');
  process.exit(0);
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('migration failed:', err);
  process.exit(1);
}
