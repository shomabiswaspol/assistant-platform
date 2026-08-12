import pg from 'pg';
import { config } from './config.js';

// Own, isolated assistant-db pool — read/write, used for all app data.
export const pool = new pg.Pool(config.db);

// Read-only pool against fazle-core's existing fazle_ai_reader role.
// Separate from the app's own `pool` above on purpose — never shares a
// connection, never shares credentials. Not created until first use, and
// only if FAZLE_DB_ENABLED=true — this app must keep working normally even
// before that credential is configured (graceful degradation).
let fazleReaderPool = null;

export function fazleBridgeEnabled() {
  return config.fazleDb.enabled && !!config.fazleDb.password;
}

export function getFazleReaderPool() {
  if (!fazleBridgeEnabled()) return null;
  if (!fazleReaderPool) {
    fazleReaderPool = new pg.Pool({
      host: config.fazleDb.host,
      port: config.fazleDb.port,
      database: config.fazleDb.name,
      user: config.fazleDb.user,
      password: config.fazleDb.password,
      max: config.fazleDb.maxPool,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      statement_timeout: config.fazleDb.statementTimeoutMs,
      // Every new physical connection in the pool is forced read-only at the
      // session level, in addition to the role's own SELECT-only grants and
      // the query-text guard in fazleBridge.js — three independent layers.
      // Uses onConnect (awaited internally by pg-pool, in _acquireClient,
      // before the client is ever handed to a caller) rather than the
      // 'connect' event — that event fires synchronously and hands the
      // client off in the same tick, so an un-awaited query on it raced
      // against whatever query the caller immediately issued on the same
      // connection, firing pg's "client.query() when the client is already
      // executing a query" deprecation warning (2026-08-10 fix).
      async onConnect(client) {
        await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
      },
    });
  }
  return fazleReaderPool;
}
