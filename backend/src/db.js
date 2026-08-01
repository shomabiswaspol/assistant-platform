import pg from 'pg';
import { config } from './config.js';

// Own, isolated assistant-db pool — read/write, used for all app data.
export const pool = new pg.Pool(config.db);

// Read-only pool against fazle-core's existing fazle_ai_reader role.
// Not created until first use, and only if FAZLE_AI_READER_DB_URL is set —
// this app must keep working even before that credential is configured.
let fazleReaderPool = null;

export function getFazleReaderPool() {
  if (!config.fazleReaderUrl) return null;
  if (!fazleReaderPool) {
    fazleReaderPool = new pg.Pool({
      connectionString: config.fazleReaderUrl,
      max: 3,
      idleTimeoutMillis: 30000,
      statement_timeout: 8000,
    });
  }
  return fazleReaderPool;
}
