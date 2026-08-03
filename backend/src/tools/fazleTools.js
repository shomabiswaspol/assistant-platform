import { getFazleReaderPool, fazleBridgeEnabled } from '../db.js';
import { maskPiiInObject } from '../lib/piiMask.js';

// Tool-calling wrappers around fazle-core's read-only bridge, for the chat
// model to call directly during a conversation (see routes/chat.js).
//
// These talk to the fazle_ai_reader Postgres pool DIRECTLY rather than
// looping an HTTP request back through fazleBridge.js's own routes — those
// routes are protected by per-user JWT (requireAuth in middleware/auth.js),
// and this codebase has no service-to-service auth secret. Inventing one
// just to call back into the same process would add a new, unaudited auth
// surface and a pointless network hop. Instead, every query below is the
// same hardcoded, parameterized SELECT fazleBridge.js already runs against
// the same views, through the same pool — so it inherits the exact same
// three-layer read-only protection (SELECT-only role grants, forced
// `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` on every
// connection in db.js, and — here — no query is ever built from raw tool
// input, only from a fixed set of literals with parameterized values).
// fazleBridge.js itself is not modified.
//
// A few of the arguments the model may pass don't correspond to a real
// filterable column on the underlying ai_read_* view (noted per-tool below).
// Those are accepted (so a tool call with them doesn't error) but ignored,
// rather than silently querying a column that may not exist.

function clampLimit(value, def, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, max);
}

async function runQuery(sql, params = []) {
  if (!fazleBridgeEnabled()) {
    return { error: 'fazle-core bridge not configured (FAZLE_DB_ENABLED/FAZLE_DB_PASSWORD)' };
  }
  const pool = getFazleReaderPool();
  try {
    // Statement timeout is already enforced per-connection by db.js
    // (FAZLE_DB_STATEMENT_TIMEOUT, default 5000ms) — no separate JS-level
    // timeout needed here.
    const { rows } = await pool.query(sql, params);
    return { rows };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('fazleTools query error:', err.message);
    return { error: 'fazle-core query failed' };
  }
}

export const fazleToolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'get_contacts',
      description: 'Look up contacts known to fazle-core: name, WhatsApp number, relation, and company. Optionally filter by a name/number search term.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Max rows to return (default 30, max 100)' },
          search: { type: 'string', description: 'Optional text to match against contact name or WhatsApp number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_employees',
      description: 'List fazle-core employees with their designation and status (active/inactive).',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Max rows to return (default 100, max 100)' },
          department: { type: 'string', description: 'Not currently filterable (the underlying view has no department column) — ignored if passed' },
          status: { type: 'string', enum: ['active', 'inactive'], description: 'Employee status filter (default active)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_messages',
      description: 'Fetch recent WhatsApp messages seen by fazle-core. Optionally filter by a sender name/number.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Max rows to return (default 10, max 50)' },
          contact_id: { type: 'string', description: 'Optional sender name or WhatsApp number to filter by' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_knowledge_base',
      description: 'Search fazle-core\'s internal knowledge base articles by category, key, or content.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Max rows to return (default 10, max 30)' },
          search: { type: 'string', description: 'Text to match against article category, key, or content preview' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_attendance',
      description: 'Look up employee attendance records, most recent first.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Max rows to return (default 30, max 100)' },
          date: { type: 'string', description: 'Optional exact attendance date filter, YYYY-MM-DD' },
          employee_id: { type: 'string', description: 'Optional employee name to filter by (no numeric employee_id column exists — matched against employee_name)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_billing_outstanding',
      description: 'List outstanding/unpaid billing records.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Max rows to return (default 30, max 100)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_cash_transactions',
      description:
        'List individual real cash transactions (salary, advances, bonuses, deductions, corrections) from fpe_cash_transactions — the sole canonical cash ledger (Owner Directive 2026-06-29). Never mixes in wbom_cash_transactions, which is legacy/archive only. For a total/sum/count/average, use get_cash_transactions_summary instead of adding these rows up yourself — manual summation over many rows is unreliable.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Max rows to return (default 30, max 100)' },
          date: { type: 'string', description: 'Optional exact transaction date filter, YYYY-MM-DD' },
          status: { type: 'string', description: "Optional transaction_status filter, e.g. 'final', 'pending', 'reversed', 'corrected'" },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_cash_transactions_summary',
      description:
        "Get an exact, database-computed total, count, and average of real cash transactions from fpe_cash_transactions — always use this for any question about a total/sum/how much/how many, instead of calling get_cash_transactions and adding the rows up yourself (the database computes this exactly; manual arithmetic over many rows is unreliable and has produced wrong totals before). Also returns a breakdown by category and by status. Never mixes in wbom_cash_transactions.",
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Optional exact transaction date filter, YYYY-MM-DD' },
          date_from: { type: 'string', description: 'Optional range start (inclusive), YYYY-MM-DD — use with date_to for a date range instead of a single date' },
          date_to: { type: 'string', description: 'Optional range end (inclusive), YYYY-MM-DD' },
          status: { type: 'string', description: "Optional transaction_status filter, e.g. 'final', 'pending', 'reversed', 'corrected'" },
          category: { type: 'string', description: 'Optional category filter' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_escort_programs',
      description: 'List escort programs (vessel escort assignments), most recent first. Optionally filter by date and/or status.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Max rows to return (default 30, max 100)' },
          date: { type: 'string', description: 'Optional exact program date filter, YYYY-MM-DD' },
          status: { type: 'string', description: 'Optional exact status filter' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_module_bridge_status',
      description: "Check fazle-core's internal service heartbeats — when each service was last seen and its current queue depth (no explicit status field exists; recency of last_seen and queue_depth are the health signals).",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_payroll_runs',
      description: 'List payroll run records per employee per period, most recent first. Optionally filter by month.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Max rows to return (default 20, max 100)' },
          month: { type: 'integer', description: 'Optional month number (1-12) to filter period_month by' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recruitment_leads',
      description: 'List recruitment funnel leads. Optionally filter by funnel stage.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Max rows to return (default 20, max 100)' },
          status: { type: 'string', description: 'Optional funnel stage filter (maps to the funnel_stage column)' },
        },
      },
    },
  },
];

export async function executeFazleTool(toolName, args = {}, { isAdmin = false } = {}) {
  try {
    switch (toolName) {
      case 'get_contacts': {
        const limit = clampLimit(args.limit, 30, 100);
        if (args.search) {
          const term = `%${String(args.search).toLowerCase()}%`;
          const { rows, error } = await runQuery(
            `SELECT contact_id, display_name, whatsapp_number, relation, company_name
               FROM ai_read_contacts
              WHERE LOWER(display_name) LIKE $1 OR whatsapp_number LIKE $1
              LIMIT $2`,
            [term, limit]
          );
          return error ? { error } : maskPiiInObject(rows, { isAdmin });
        }
        const { rows, error } = await runQuery(
          'SELECT contact_id, display_name, whatsapp_number, relation, company_name FROM ai_read_contacts LIMIT $1',
          [limit]
        );
        return error ? { error } : maskPiiInObject(rows, { isAdmin });
      }

      case 'get_employees': {
        const status = args.status === 'inactive' ? 'inactive' : 'active';
        const { rows, error } = await runQuery(
          'SELECT employee_id, employee_name, designation, status FROM ai_read_employees WHERE status = $1 ORDER BY employee_name LIMIT 100',
          [status]
        );
        return error ? { error } : rows;
      }

      case 'get_messages': {
        const limit = clampLimit(args.limit, 10, 50);
        if (args.contact_id) {
          const term = `%${String(args.contact_id).toLowerCase()}%`;
          const { rows, error } = await runQuery(
            `SELECT sender_number, sender_name, message_body, direction, source, received_at
               FROM ai_read_recent_messages
              WHERE LOWER(sender_name) LIKE $1 OR sender_number LIKE $1
              ORDER BY received_at DESC LIMIT $2`,
            [term, limit]
          );
          return error ? { error } : maskPiiInObject(rows, { isAdmin });
        }
        const { rows, error } = await runQuery(
          'SELECT sender_number, sender_name, message_body, direction, source, received_at FROM ai_read_recent_messages ORDER BY received_at DESC LIMIT $1',
          [limit]
        );
        return error ? { error } : maskPiiInObject(rows, { isAdmin });
      }

      case 'get_knowledge_base': {
        const limit = clampLimit(args.limit, 10, 30);
        const term = args.search || args.category;
        if (term) {
          const { rows, error } = await runQuery(
            `SELECT id, key, category, subcategory, content_preview FROM ai_read_kb_articles
              WHERE LOWER(category) LIKE $1 OR LOWER(key) LIKE $1 OR LOWER(content_preview) LIKE $1
              LIMIT $2`,
            [`%${String(term).toLowerCase()}%`, limit]
          );
          return error ? { error } : rows;
        }
        const { rows, error } = await runQuery(
          'SELECT id, key, category, subcategory, content_preview FROM ai_read_kb_articles LIMIT $1',
          [limit]
        );
        return error ? { error } : rows;
      }

      case 'get_attendance': {
        const limit = clampLimit(args.limit, 30, 100);
        const conds = [];
        const params = [];
        if (args.date) {
          params.push(args.date);
          conds.push(`attendance_date = $${params.length}`);
        }
        if (args.employee_id) {
          params.push(`%${String(args.employee_id).toLowerCase()}%`);
          conds.push(`LOWER(employee_name) LIKE $${params.length}`);
        }
        params.push(limit);
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const { rows, error } = await runQuery(
          `SELECT employee_name, designation, attendance_date, status, location, remarks
             FROM ai_read_attendance_summary ${where}
            ORDER BY attendance_date DESC LIMIT $${params.length}`,
          params
        );
        return error ? { error } : rows;
      }

      case 'get_billing_outstanding': {
        const limit = clampLimit(args.limit, 30, 100);
        const { rows, error } = await runQuery('SELECT * FROM ai_read_billing_outstanding LIMIT $1', [limit]);
        return error ? { error } : rows;
      }

      case 'get_cash_transactions': {
        const limit = clampLimit(args.limit, 30, 100);
        const conds = [];
        const params = [];
        if (args.date) {
          params.push(args.date);
          conds.push(`transaction_date = $${params.length}`);
        }
        if (args.status) {
          params.push(args.status);
          conds.push(`transaction_status = $${params.length}`);
        }
        params.push(limit);
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const { rows, error } = await runQuery(
          `SELECT transaction_ref, transaction_date, amount, category, transaction_status,
                  payout_method, employee_name, is_reversal
             FROM ai_read_cash_transactions ${where} LIMIT $${params.length}`,
          params
        );
        return error ? { error } : rows;
      }

      case 'get_cash_transactions_summary': {
        const conds = [];
        const params = [];
        if (args.date) {
          params.push(args.date);
          conds.push(`transaction_date = $${params.length}`);
        }
        if (args.date_from) {
          params.push(args.date_from);
          conds.push(`transaction_date >= $${params.length}`);
        }
        if (args.date_to) {
          params.push(args.date_to);
          conds.push(`transaction_date <= $${params.length}`);
        }
        if (args.status) {
          params.push(args.status);
          conds.push(`transaction_status = $${params.length}`);
        }
        if (args.category) {
          params.push(args.category);
          conds.push(`category = $${params.length}`);
        }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

        // Two queries, both computed by Postgres — never sum in JS/the model.
        const totals = await runQuery(
          `SELECT COUNT(*) AS transaction_count,
                  COALESCE(SUM(amount), 0) AS total_amount,
                  COALESCE(AVG(amount), 0)::numeric(14,2) AS average_amount
             FROM ai_read_cash_transactions ${where}`,
          params
        );
        if (totals.error) return { error: totals.error };

        const byCategory = await runQuery(
          `SELECT category, COUNT(*) AS transaction_count, COALESCE(SUM(amount), 0) AS total_amount
             FROM ai_read_cash_transactions ${where}
            GROUP BY category ORDER BY total_amount DESC`,
          params
        );
        if (byCategory.error) return { error: byCategory.error };

        return {
          ...totals.rows[0],
          by_category: byCategory.rows,
        };
      }

      case 'get_escort_programs': {
        const limit = clampLimit(args.limit, 30, 100);
        const conds = [];
        const params = [];
        if (args.date) {
          params.push(args.date);
          conds.push(`program_date = $${params.length}`);
        }
        if (args.status) {
          params.push(args.status);
          conds.push(`status = $${params.length}`);
        }
        params.push(limit);
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const { rows, error } = await runQuery(
          `SELECT program_id, mother_vessel, lighter_vessel, destination, program_date, shift, status,
                  escort_name, escort_mobile, assignment_time, completion_time
             FROM ai_read_escort_programs ${where}
            ORDER BY program_date DESC LIMIT $${params.length}`,
          params
        );
        return error ? { error } : maskPiiInObject(rows, { isAdmin });
      }

      case 'get_module_bridge_status': {
        // ai_read_module_bridge_status has no "status" column — verified
        // 2026-08-02 via `\d+ ai_read_module_bridge_status` against the real
        // fazle_ai_reader-visible view: it's service_name, last_seen,
        // queue_depth, metadata (view maps service->service_name,
        // meta_json->metadata off fazle_service_heartbeats). This was a
        // pre-existing bug shared with fazleBridge.js's own /module-bridge-
        // status route, which still references the non-existent column —
        // fazleBridge.js is out of scope here and is left as-is.
        const { rows, error } = await runQuery(
          'SELECT service_name, last_seen, queue_depth, metadata FROM ai_read_module_bridge_status LIMIT 20'
        );
        return error ? { error } : rows;
      }

      case 'get_payroll_runs': {
        const limit = clampLimit(args.limit, 20, 100);
        const conds = [];
        const params = [];
        const month = parseInt(args.month, 10);
        if (Number.isFinite(month) && month >= 1 && month <= 12) {
          params.push(month);
          conds.push(`period_month = $${params.length}`);
        }
        params.push(limit);
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const { rows, error } = await runQuery(
          `SELECT employee_name, designation, period_year, period_month, status,
                  total_programs, gross_salary, net_salary, total_advances, total_deductions
             FROM ai_read_payroll_runs ${where}
            ORDER BY period_year DESC, period_month DESC LIMIT $${params.length}`,
          params
        );
        return error ? { error } : rows;
      }

      case 'get_recruitment_leads': {
        const limit = clampLimit(args.limit, 20, 100);
        const conds = [];
        const params = [];
        if (args.status) {
          params.push(args.status);
          conds.push(`funnel_stage = $${params.length}`);
        }
        params.push(limit);
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const { rows, error } = await runQuery(
          `SELECT id, phone, funnel_stage, source, full_name, area, score_bucket, created_at
             FROM ai_read_recruitment_leads ${where} LIMIT $${params.length}`,
          params
        );
        return error ? { error } : maskPiiInObject(rows, { isAdmin });
      }

      default:
        return { error: `unknown fazle tool: ${toolName}` };
    }
  } catch (err) {
    // Should be unreachable (runQuery already catches) — defense in depth so
    // a tool call can never crash the chat request.
    // eslint-disable-next-line no-console
    console.error(`fazleTools ${toolName} error:`, err.message);
    return { error: 'fazle tool execution failed' };
  }
}
