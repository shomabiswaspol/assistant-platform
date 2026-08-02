import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { join } from 'path';
import { pool } from './db.js';

const migrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort(); // 001_, 002_, ... — filename order is migration order

try {
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    await pool.query(sql);
    // eslint-disable-next-line no-console
    console.log(`applied: ${file}`);
  }
  // eslint-disable-next-line no-console
  console.log('migrations applied');
  process.exit(0);
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('migration failed:', err);
  process.exit(1);
}
