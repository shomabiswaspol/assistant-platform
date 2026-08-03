import { Router } from 'express';
import { getFazleReaderPool, fazleBridgeEnabled } from '../db.js';
import { requireAuth, requireApproved } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireApproved);

// Read-only bridge into fazle-core's data, reusing the EXISTING
// fazle_ai_reader Postgres role (see /home/azim/core/modules/ai_readonly_tools/).
// Deliberately restricted to the same ai_read_* views fazle-core itself
// exposes to its AI console — no raw production tables, no writes, ever.
// fazle-core was not modified in any way to support this.
//
// Three independent layers keep this read-only, in case any one fails:
//   1. The fazle_ai_reader Postgres role only has SELECT grants (audited
//      2026-08-02: exactly 10 ai_read_* views, no raw tables, no writes).
//   2. Every pooled connection issues `SET SESSION CHARACTERISTICS AS
//      TRANSACTION READ ONLY` on connect (see db.js).
//   3. The query-text guard below rejects anything that isn't a plain
//      SELECT before it's ever sent to Postgres.
//
// Only a small, named set of query functions is exposed here — never a
// generic "run arbitrary SQL" endpoint.

const FORBIDDEN_SQL = /\b(insert|update|delete|drop|truncate|alter|create|grant|revoke|copy)\b/i;

async function readOnlyQuery(res, sql, params = []) {
  if (FORBIDDEN_SQL.test(sql)) {
    // Should be unreachable — every query below is a hardcoded literal —
    // this is defense-in-depth, not something callers can trigger.
    return res.status(500).json({ error: 'fazleBridge: write operations are forbidden' });
  }
  const pool = getFazleReaderPool();
  if (!pool) {
    return res.status(503).json({
      error: 'fazle-core bridge not configured',
      hint: 'set FAZLE_DB_PASSWORD and FAZLE_DB_ENABLED=true in backend/.env — see backend/.env.example',
    });
  }
  try {
    const { rows } = await pool.query(sql, params);
    return res.json(rows);
  } catch (err) {
    // Never include err (may carry connection details) in the response or
    // in a log line that could reach a report/commit — message text only,
    // and only server-side stdout, never persisted by this app.
    // eslint-disable-next-line no-console
    console.error('fazleBridge query error:', err.message);
    return res.status(502).json({ error: 'fazle-core bridge query failed' });
  }
}

router.get('/status', async (_req, res) => {
  if (!fazleBridgeEnabled()) {
    return res.json({ enabled: false, connected: false, readonly: true });
  }
  const pool = getFazleReaderPool();
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return res.json({ enabled: true, connected: true, readonly: true, latencyMs: Date.now() - start });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('fazleBridge status check failed:', err.message);
    return res.json({ enabled: true, connected: false, readonly: true });
  }
});

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

router.get('/attendance', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  return readOnlyQuery(
    res,
    'SELECT employee_name, designation, attendance_date, status, location, remarks FROM ai_read_attendance_summary ORDER BY attendance_date DESC LIMIT $1',
    [limit]
  );
});

router.get('/billing-outstanding', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  return readOnlyQuery(res, 'SELECT * FROM ai_read_billing_outstanding LIMIT $1', [limit]);
});

// ai_read_cash_transactions — fpe_cash_transactions ONLY, never
// wbom_cash_transactions (legacy/archive, Owner Directive 2026-06-29 — see
// CANONICAL_BUSINESS_RULES.md §Cash Transaction). Proposal:
// proposal_ai_read_cash_transactions_20260802.md. The view itself is
// pending DDL on fazle-core's side as of this code — until then this
// endpoint returns a clean 503/502 (fazleBridgeEnabled() check / query
// error), never silently wrong or mixed-table data.
router.get('/cash-transactions', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  const conds = [];
  const params = [];
  if (req.query.date) {
    params.push(req.query.date);
    conds.push(`transaction_date = $${params.length}`);
  }
  if (req.query.status) {
    params.push(req.query.status);
    conds.push(`transaction_status = $${params.length}`);
  }
  params.push(limit);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return readOnlyQuery(
    res,
    `SELECT transaction_ref, transaction_date, amount, category, transaction_status,
            payout_method, employee_name, is_reversal
       FROM ai_read_cash_transactions ${where} LIMIT $${params.length}`,
    params
  );
});

router.get('/escort-programs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  return readOnlyQuery(
    res,
    `SELECT program_id, mother_vessel, lighter_vessel, destination, program_date, shift, status,
            escort_name, escort_mobile, assignment_time, completion_time
       FROM ai_read_escort_programs ORDER BY program_date DESC LIMIT $1`,
    [limit]
  );
});

router.get('/module-bridge-status', (_req, res) => {
  return readOnlyQuery(
    res,
    'SELECT service_name, status, last_seen, metadata FROM ai_read_module_bridge_status LIMIT 20'
  );
});

router.get('/payroll-runs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  return readOnlyQuery(
    res,
    `SELECT employee_name, designation, period_year, period_month, status,
            total_programs, gross_salary, net_salary, total_advances, total_deductions
       FROM ai_read_payroll_runs ORDER BY period_year DESC, period_month DESC LIMIT $1`,
    [limit]
  );
});

router.get('/recruitment-leads', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  return readOnlyQuery(
    res,
    'SELECT id, phone, funnel_stage, source, full_name, area, score_bucket, created_at FROM ai_read_recruitment_leads LIMIT $1',
    [limit]
  );
});

export default router;
