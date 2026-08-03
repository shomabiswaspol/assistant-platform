# Proposal: `ai_read_cash_transactions` view

**Date:** 2026-08-02 · **Status: FINAL — canonical table locked, Owner-approved.**
**Author:** Claude (assistant-platform), on Owner's request after a review of a failed Hermes/Chat query
**Follows:** fazle-core's KB-First Policy — 6-part structure, stop for management approval before any production change. **The view/GRANT DDL below is still not executed by me — that step is explicitly for the Owner/fazle-core side, per KB hard constraint #7. Everything else in this proposal (KB docs, decision log, application code) has now been done.**

---

## 1. Current production behavior

There is no way for the AI read-only bridge (Chat's tool-calling, or Hermes)
to answer any question about cash transactions today. Confirmed directly,
not assumed:

- `fazle_ai_reader` (the role both `fazleBridge.js` and `fazleTools.js` use)
  gets `permission denied` on a direct `SELECT COUNT(*)` against
  `fpe_cash_transactions` — verified with `has_table_privilege()`, not just
  inferred from an error message.
- No `ai_read_*` view exposes cash-transaction data. The role can see raw
  table *names* via `\dt` (harmless PostgreSQL catalog-visibility behavior —
  any connected role sees table names in schemas it has `USAGE` on, this is
  not itself a permission grant), but has zero actual `SELECT` privilege
  beyond the 10 already-approved `ai_read_*` views.
- Real user-visible impact: asked "how much cash-transactions saved in
  database on 2026-08-02," the Chat page had no tool to call, and (compounded
  by a separate, now-fixed, tool-calling reliability bug) gave a hallucinated,
  self-contradicting answer instead of the honest "I don't have a tool for
  that" it should have given.

## 2. Knowledge Base reference

`knowledge_base/06_developer_system/ai_readonly_data_access.md`
(`DEV-AI-READONLY-ACCESS`) documents the existing pattern this proposal
extends: `fazle_ai_reader` role, SELECT-only on approved `ai_read_*` views,
row limits, sensitive-field exclusion at the view level, no arbitrary SQL.

**One pre-existing KB/production drift found while reading this, unrelated
to this proposal but worth noting**: the KB lists "9 views" and doesn't
mention `ai_read_billing_outstanding`, which exists in production as a 10th
view (confirmed via `\dv`). Someone added it without updating this KB
article. Not fixing that here — flagging it since it's exactly the kind of
gap the KB-first policy exists to catch.

## 3. Gap analysis

| | KB said | Production has | Now |
|---|---|---|---|
| Approved views | 9, cash transactions not among them | 10 (undocumented `ai_read_billing_outstanding`) | 11 (docs fixed, `ai_read_cash_transactions` added — DDL pending) |
| Cash transaction visibility | Not addressed | No access at all | Resolved below |

**Open question — resolved.** Two candidate source tables existed
(`fpe_cash_transactions` vs `wbom_cash_transactions`). **Answer:
`fpe_cash_transactions` is the sole canonical table.** Confirmed two ways,
independently:

1. Directly in fazle-core's own code — `modules/payment_ingest/wbom_fpe_sync.py`'s
   docstring cites an explicit **Owner Directive (2026-06-29)**: *"
   fpe_cash_transactions is the ONLY canonical cash transaction table.
   wbom_cash_transactions becomes legacy archive / source reference only."*
2. Already documented in `CANONICAL_BUSINESS_RULES.md`'s `## Cash
   Transaction` section (pre-existing, this proposal didn't need to add
   the write-path rule — only the AI-read-access angle, see §4).

**Business rule, Owner-confirmed, now also in the KB (§4 below):** no live
AI financial answer may read from `wbom_cash_transactions`, and no answer
may mix both tables — double-counting / wrong-ledger risk.

## 4. Proposed implementation

**KB updates (done):**
- `knowledge_base/06_developer_system/ai_readonly_data_access.md` — view
  count fixed 9 → 11, `ai_read_billing_outstanding` and
  `ai_read_cash_transactions` both now listed.
- `knowledge_base/00_governance/CANONICAL_BUSINESS_RULES.md` — `## Cash
  Transaction` section gets one new line under Structural Rules (the
  AI-read-access rule above — the write-path rule already existed here).
  `## AI Console` section's Canonical Database Tables list corrected (it
  was already stale, missing several views independent of this proposal)
  and `ai_read_cash_transactions` added, marked pending DDL.
- `knowledge_base/00_governance/management_decisions.md` — new entry
  recording this decision, the KB drift found and fixed, and the new
  view's approval, following this file's own established format.

**View (Owner/fazle-core side to execute — not run by me):** same
curation pattern as the existing `ai_read_billing_outstanding` view
(amounts + dates + status, `LEFT JOIN` for friendly names, no raw
audit/internal columns), locked to `fpe_cash_transactions`.

**Correction made 2026-08-03, before handoff:** the join originally
referenced `e.employee_name`, which does not exist on `fpe_employees` —
verified directly via `\d fpe_employees` (read-only schema inspection
only, no DDL run). The real column is `full_name`. Fixed below to
`COALESCE(e.full_name, t.employee_name_raw)`. This does not change the
view's own output shape — the output column stays named `employee_name`
via the `AS` alias, matching what the application code
(`fazleBridge.js`/`fazleTools.js`/`fazle-mcp/server.py`) already expects;
only the join's *source* reference was wrong, so no application code
needed a corresponding change.

```sql
CREATE VIEW ai_read_cash_transactions AS
SELECT
    t.txn_ref            AS transaction_ref,
    t.txn_date            AS transaction_date,
    t.amount,
    t.txn_category        AS category,
    t.transaction_status,
    t.payout_method,
    COALESCE(e.full_name, t.employee_name_raw) AS employee_name,
    t.is_reversal
FROM fpe_cash_transactions t
LEFT JOIN fpe_employees e ON e.id = t.employee_id
WHERE t.deleted_at IS NULL
ORDER BY t.txn_date DESC;

GRANT SELECT ON ai_read_cash_transactions TO fazle_ai_reader;
```

**Deliberately excluded**, matching the existing views' pattern of
excluding sensitive fields at the view level (KB hard constraint #5):
`payout_phone`/`employee_phone`/`payment_mobile` (phone numbers — same
exclusion class as NID/bank account in the KB), `original_payload`/
`metadata` (raw jsonb, could contain anything including message content
not meant for AI consumption), `approved_by`/`submitted_by`/`created_by`
(internal usernames), `source_message_id`/`fpe_wa_message_id` (internal
cross-references with no standalone meaning to an AI consumer).

**Application-side (done — code is written and deployed, but non-functional
until the view above actually exists):**
- `backend/src/routes/fazleBridge.js`: `GET /cash-transactions?limit=&date=&status=`
  (same `readOnlyQuery()` pattern as every other endpoint in that file, same row cap).
- `backend/src/tools/fazleTools.js`: `get_cash_transactions` tool, same
  pattern as the existing 10 — available to Chat's tool-calling.
- `fazle-mcp/server.py`: matching MCP tool, so Hermes gets the same
  capability (Hermes ⊇ Chat's data-read scope, per the Owner-approved AI
  Roles Policy — see `assistant-platform/AI_ROLES_POLICY.md`).
- **Still not done by me**: the `CREATE VIEW`/`GRANT` DDL itself. KB hard
  constraint #7 is explicit — *"Production DB schema cannot be changed by
  AI"* — someone on fazle-core's own side (or the Owner directly) runs
  that DDL (given at the end of this document); until then, all three
  code paths above will return a clean `permission denied`/`fazle-core
  query failed` error, not silently wrong data.

## 5. Risk assessment

- **Low risk to fazle-core itself**: a `CREATE VIEW` is additive, doesn't
  touch `fpe_cash_transactions`/`wbom_cash_transactions` or any existing
  view/grant. Same three-layer read-only protection as the existing 10
  views applies automatically (role has no write grants at all, connection
  forces `READ ONLY`, `fazleBridge.js`'s query-text guard).
- **Wrong-table risk: resolved**, not just mitigated — the canonical table
  is Owner-confirmed and cross-verified against fazle-core's own code, not
  a judgment call.
- **Row-level financial exposure**: this is real money data (`amount`,
  `payout_method`, category) — more sensitive than most of the existing 10
  views (e.g. `ai_read_contacts`). Recommend row cap and no `SELECT *` in
  the app-side query (already reflected in the proposed columns above,
  narrower than most existing views).

## 6. Rollback strategy

- `DROP VIEW ai_read_cash_transactions;` — instant, no data impact, view
  only ever reads.
- Revoking `GRANT SELECT ... TO fazle_ai_reader` alone (without dropping)
  immediately cuts AI access while leaving the view definition in place
  for inspection.
- Application-side: revert the small additions to `fazleBridge.js`/
  `fazleTools.js`/`fazle-mcp/server.py` — no migration, no data written
  anywhere by this feature at any point.

---

## For the Owner/fazle-core side to run

**DDL** (on the actual production Postgres, as a role with `CREATE`/`GRANT`
on `public` — not the read-only `fazle_ai_reader` connection):

```sql
CREATE VIEW ai_read_cash_transactions AS
SELECT
    t.txn_ref             AS transaction_ref,
    t.txn_date             AS transaction_date,
    t.amount,
    t.txn_category         AS category,
    t.transaction_status,
    t.payout_method,
    COALESCE(e.full_name, t.employee_name_raw) AS employee_name,
    t.is_reversal
FROM fpe_cash_transactions t
LEFT JOIN fpe_employees e ON e.id = t.employee_id
WHERE t.deleted_at IS NULL
ORDER BY t.txn_date DESC;

GRANT SELECT ON ai_read_cash_transactions TO fazle_ai_reader;
```

**fazle-core git (KB doc changes only — no code/schema in this repo
changed by this proposal):**

```bash
cd /home/azim/core
git status
git diff -- knowledge_base/
git add knowledge_base/06_developer_system/ai_readonly_data_access.md \
        knowledge_base/00_governance/CANONICAL_BUSINESS_RULES.md \
        knowledge_base/00_governance/management_decisions.md
git commit -m "docs: canonical cash ledger AI-read rule + ai_read_cash_transactions view + KB view-count fix"
git push origin main
```

No restart needed for the KB doc changes themselves (documentation only).
Restart only after the DDL above is actually run, if fazle-core's own
`modules/ai_readonly_tools` is ever extended to use the new view (not part
of this proposal — this proposal only wires assistant-platform's Chat/
Hermes to it).
