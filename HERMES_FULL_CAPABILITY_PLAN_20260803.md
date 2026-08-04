# Hermes Full-Capability Plan — Reply, Monitor, Fix, Report, Task Execution

**Status:** Phases 1, 2, and 3 IMPLEMENTED + TESTED + RUNTIME VERIFIED
2026-08-04 (foundational capabilities task — see
`progress_gap_next_implement_queue.md` and the session's implementation
report for full detail). Phases 4, 5, and 6 remain planning-only, unchanged
from the original 2026-08-03 write-up below. Mode TTL/auto-revert
(`AI_ROLES_POLICY.md`'s tracked gap) was also closed and runtime-verified
in the same session, plus a real PII exposure bug found and fixed+runtime-
verified (`AI_ROLES_POLICY.md`'s "Data Display Rules"). WhatsApp/bridge3
(Phase 6) remains explicitly Owner-deferred — untouched.

**Scope:** what it would take to make Hermes a genuine "Jarvis" — able to
watch/monitor the VPS and fazle-core, fix/implement code, report findings,
run defined tasks on request, and reply/send WhatsApp messages on the
Owner's behalf or on Owner's permission. This is a large, multi-phase
effort — not a single session's work, and several phases have real open
risk decisions that need Owner sign-off before building, not after.

---

## 0. What's already true, verified this session — don't rebuild these

- **Hermes mode gate is live**: READ/BUILD/RUN, fail-closed to READ,
  admin-changeable via `/api/hermes/mode`, enforced by which toolsets
  `hermes-runner/server.py` allows per mode. Any new capability below
  should be gated by mode, not bypass it.
- **Confirm-before-destructive is live and real** (Hermes's own built-in
  gate, `--yolo` never passed) — any new tool that can write/execute
  should go through this, not around it.
- **fazle-mcp already gives Hermes 11 fazle-core read tools** via a
  dedicated low-privilege service account (`hermes-mcp-svc`) — the pattern
  for adding *more* read-only fazle-core visibility (e.g. message metrics,
  below) is to extend this existing MCP server, not build a second one.
- **bridge3 (8801805529211/REC2) is running and healthy at the bridge
  level, but has zero fazle-core application-layer integration, and no
  MCP server exists for WhatsApp at all** (`/home/azim/whatsapp-mcp/` only
  has the Go bridge binary + an unrelated media-processor helper).
  Confirmed by direct code/log inspection this session, not assumed.
  **Explicitly deferred by Owner decision** — see fazle-core's
  `management_decisions.md`, "Bridge3 — Current State & Decision
  (2026-08-03)". Building on it now requires a fresh, explicit go-ahead —
  this plan does not assume that's already granted.
- **A proven review-queue pattern now exists for AI-generated WhatsApp
  content**: `fazle_draft_replies` + `APPROVE <id>`/`REJECT <id>` admin
  WhatsApp commands, 24h TTL (expires, never auto-sends). Any Hermes-
  initiated WhatsApp send should reuse this exact pattern, not invent a
  new one.
- **fazle-core already has a mature parallel system worth studying, not
  copying wholesale**: `modules/admin_directives` + `modules/rbac` —
  fail-closed RBAC, persistent admin-instruction table, rate-limited
  WhatsApp admin commands (`AI`/`AUTOREPLY`/`REMEMBER`/`SEND`). This is a
  *different* system (fazle-core's own internal admin AI, reached via
  fazle-core's WhatsApp bridges) from Hermes (assistant-platform's agent,
  reached via the web page) — they should stay separate, but the design
  pattern is directly reusable.
- **fazle-core already exposes real message-flow/metrics data via existing
  admin API routes** — `/api/social/status`, `/api/social/queue`,
  `/api/social/flagged` (queue depth, sent-24h count, flagged-open count,
  rate-limit state). This is the fastest, lowest-risk win in this whole
  plan — see Phase 1.
- **fazle-core already has a defined-task execution surface**: 15
  scheduler jobs, `RUN JOB <name>` admin WhatsApp command
  (`modules/scheduler`). "Targeted/defined particular task running" for
  Hermes could mean *triggering these*, not building a second scheduler.

---

## 1. Phase 1 — Message metrics / message flow visibility (lowest risk, do first)

**IMPLEMENTED + TESTED 2026-08-04.** Built largely as scoped below, with one
real architecture difference found during implementation: fazle-core has no
existing HTTP surface assistant-platform could reuse for this (fazleBridge.js
only ever did direct Postgres reads) — this required a genuinely NEW
integration, `fazle-mcp/fazle_core_client.py`, calling fazle-core's own app
(127.0.0.1:8200) directly with a dedicated admin API key
(`FAZLE_CORE_API_KEY`, NOT the master `INTERNAL_API_KEY` — Owner decision,
2026-08-04). Three new tools (`get_social_status`, `get_social_queue`,
`get_social_flagged`) plus `get_social_report` (Phase 2, see below) in
`fazle-mcp/metrics_tools.py`. `target_id` in queue/flagged is masked via the
new PII policy. 20 tests (`fazle-mcp/tests/test_metrics_tools.py` +
`test_fazle_core_client.py`), all passing. **RUNTIME VERIFIED, 2026-08-04**
— `core/scripts/create_hermes_mcp_admin.py` run by the Owner (dedicated
admin identity, phone `01958122304`, role `viewer`, `admin_id 39`,
`FAZLE_CORE_API_KEY` now live in `~/.hermes/config.yaml`), then
`get_social_status`/`get_social_queue`/`get_social_flagged`/
`get_social_report` all called for real against the live fazle-core app:
real queue rows (`bridge1`/`bridge2`, real `target_id` phone numbers, real
`intent`/`status`), real rate-limit state, correctly computed HEALTHY
report text (0 pending/failed/flagged at check time).

**Goal:** Hermes can answer "what's the state of the WhatsApp reply
pipeline?" — queue depth, sent count, flagged items — without any new
send/write capability.

**What to build:**
- A new read-only tool in `fazle-mcp` (mirroring the existing 11) that
  calls fazle-core's existing `/api/social/status`, `/api/social/queue`,
  `/api/social/flagged` routes.
- No new fazle-core code — these routes already exist and are already
  admin-API-key gated.

**Risk:** near-zero — pure read, same trust boundary as the existing 11
fazle-mcp tools.

**Owner decision needed:** none, really — this is close to a formality
approval given the near-zero risk, but confirm before starting per this
project's standing rule.

---

## 2. Phase 2 — Structured reporting capability

**IMPLEMENTED + TESTED 2026-08-04**, adapted from this plan rather than
built as originally scoped (markdown files in a reports/ directory) — a
reusable schema/formatter (`fazle-mcp/report_schema.py`'s `build_report()`)
was judged more useful than static files for a first cut, since it gives
Hermes one deterministic tool call (`get_social_report`) instead of relying
on LLM narration to assemble three separate metric calls consistently.
Returns both a structured dict (future automation) and pre-formatted text
(chat/UI). Reusable by any future tool needing the same shape (e.g. Phase 4's
audit findings). 7 tests, all passing. Markdown-file persistence (the
original scoping) was not built — flagging as a real difference from the
original plan, not an oversight.

**Goal:** Hermes can compile a defined report (e.g. "daily WhatsApp reply
health," "what changed in the codebase this week") into a persistent,
reviewable artifact — not just a chat answer that scrolls away.

**What to build:**
- A convention (not new infrastructure): Hermes writes reports as
  timestamped markdown files in a defined location (e.g.
  `assistant-platform/reports/` or fazle-core's
  `knowledge_base/00_governance/` for fazle-core-specific reports,
  matching this session's own precedent of proposal/decision docs).
- Optionally: a Hermes "report" mode/command that structures this
  consistently (title, scope, findings, verified-vs-assumed, next steps)
  — reusing the shape this session's own proposals already used
  successfully.

**Risk:** low — read/write to a docs location, no production effect.

**Owner decision needed:** where reports live, and whether they need a
notification (WhatsApp ping when one's ready) or just get checked
on-demand.

---

## 3. Phase 3 — Targeted/defined task execution

**IMPLEMENTED + TESTED 2026-08-04.** `fazle-mcp/scheduler_tools.py`'s
`run_scheduled_task(job_name, confirm=False)` — allowlists and categorizes
all 16 of fazle-core's real scheduler jobs (READ_ONLY / LOW_RISK_ACTION /
DESTRUCTIVE), calling the same `POST /scheduler/run/{job_name}` route this
plan already identified. Owner decision 2026-08-04: `daily_payroll_compute`
IS included, tiered DESTRUCTIVE (requires RUN mode + explicit `confirm=true`,
reusing Hermes's existing confirm-before-destructive prompt gate rather than
inventing a second one, per this plan's own framing above). Mode gate reads
`hermes-runner`'s mode file directly (documented architecture-decision
rationale in the session's implementation report) since fazle-mcp and
hermes-runner are independent processes with no shared toolset-registration
hook available for a single new tool. 13 tests, all passing, including the
exact denial/allow matrix (READ denies everything, DESTRUCTIVE requires
RUN+confirm, corrupted/missing mode file fails closed). **RUNTIME
VERIFIED, 2026-08-04**: `hermes-runner` set to real BUILD mode (live
`POST /mode`), then `run_scheduled_task('health_summary')` called for real
— genuinely triggered fazle-core's live `health_summary` job end-to-end
(mode gate → allowlist → duplicate guard → real `POST /scheduler/run/
health_summary` → `{"status": "ok", "overall": "ok"}`), then mode
explicitly reverted back to READ afterward (not left elevated). A
DESTRUCTIVE-tier job was deliberately NOT triggered as part of this
verification — READ_ONLY-tier `health_summary` was chosen specifically to
prove the pipeline without any real-world write effect. **Real,
pre-existing fazle-core gap found and documented, not fixed** (out of
scope — fazle-core's own governance): `/scheduler/run/{job_name}` itself
has no RBAC role check, only `require_api_key` — unlike the WhatsApp
`RUN JOB` path.

**Goal:** Hermes can trigger a *specific, pre-approved* task on request
("run the daily payroll compute now," "check backup freshness") rather
than improvising arbitrary shell commands for routine operations.

**What to build:**
- A new fazle-mcp tool (or reuse of the existing `RUN JOB <name>` admin
  command pattern via a scoped HTTP call) that lets Hermes trigger one of
  the 15 already-defined, already-audited scheduler jobs by name — not
  arbitrary code.
- Explicitly NOT a general "run any command" tool — this is about
  *defined* tasks specifically, per the Owner's own phrasing. Arbitrary
  execution already exists via Hermes's RUN-mode terminal access; this
  phase is about giving *named, safe, pre-vetted* actions a lower-friction
  path that doesn't require RUN mode's full blast radius.

**Risk:** low-medium — bounded to a known job list, but still a real
external effect (e.g. triggering payroll compute early). Should require
at least BUILD mode, arguably RUN mode given some jobs' effects.

**Owner decision needed:** which of the 15 jobs (if not all) should be
Hermes-triggerable; what mode tier gates this.

---

## 4. Phase 4 — Fix/implement, exercised through Hermes specifically

**TRIAL RUN, 2026-08-04 — gap closed, real track record now exists.** The
honest gap below (Hermes's fix/implement capability had never actually
been exercised) was tested for real: a supervised BUILD→RUN lifecycle
trial, scoped to `assistant-platform/backend/src`, low-stakes and
reversible. Full transcript (multi-turn, via `hermes-runner`'s real
`/run` endpoint, not simulated):
1. **Investigate** (BUILD mode): asked Hermes to use its own audit tools
   (`audit_read_file`, then a wider `audit_search_code`) to find one
   genuinely low-risk code-quality issue in `backend/src`. First narrow
   attempt (single file) correctly reported "nothing worth fixing" rather
   than inventing an issue — a real, useful honesty signal. Widened scope
   found a real one: `config.redisUrl` defined in `config.js` but read
   nowhere in the codebase (confirmed independently via `grep`).
2. **Propose**: Hermes showed the exact one-line diff and explicitly
   stopped, asking "Should I proceed? (yes/no)" — the confirm-before-
   destructive gate firing correctly, not bypassed.
3. **Confirm + apply**: admin confirmed; Hermes applied exactly that one
   line via its file tool. On-disk `git diff` checked independently —
   matched exactly what was proposed, nothing else touched.
4. **Verify**: escalated to RUN mode (confirmed, `TASK`-scoped, 600s TTL)
   specifically so Hermes could run the *real* test suite via its terminal
   tool (`cd backend && npm test`), not just its own ad-hoc check — 36/36
   passing. Independently re-run by the admin afterward: 36/36, identical.
5. **Report**: Hermes produced a structured STATUS/SUMMARY/EVIDENCE/RISK/
   RECOMMENDATION/ACTION-REQUIRED report unprompted-in-format (asked for
   that shape, delivered it correctly), and correctly noted — without
   being asked — the other pre-existing uncommitted files in the repo that
   it had *not* touched.
6. **No deploy/restart**: neither Hermes nor the admin restarted
   `assistant-backend` or ran `docker compose build/up` — explicitly out
   of scope for this trial, confirmed via `mode_audit.log`'s full trail
   (BUILD → RUN → READ, all admin-initiated, no gaps).

**Verdict:** Hermes's BUILD/RUN capability performed correctly on a real,
if small, task — honest about finding nothing on the first attempt,
accurate on the second, respected the confirm gate without needing it
enforced externally, and self-reported honestly. This is one data point,
not a green light for autonomous higher-stakes work — see the original
"what to do" framing below, still valid for anything bigger.

**Original framing (still applies for future, higher-stakes trials):**
pick one real, low-stakes, already-understood fix (e.g. the still-open
`_safe_polish()` numeric whitelist review, flagged as a known gap in an
earlier session) and have Hermes attempt it end-to-end, with an admin
reviewing every step, before trusting it on anything higher-stakes.

**Risk:** depends entirely on what gets picked — start with something
genuinely low-stakes, already well-understood by a human, specifically so
a Hermes mistake is cheap to catch.

**Owner decision needed:** which task to use as the trial, and how much
autonomy to allow (constant supervision vs. checkpoint-only).

---

## 5. Phase 5 — Watch/monitor (proactive, not just on-demand)

**Goal:** Hermes doesn't just answer monitoring questions when asked — it
periodically checks defined things and flags anomalies unprompted.

**This is architecturally different from everything above** — it requires
a *scheduled* trigger (Hermes doesn't run continuously; `hermes-runner`
only responds to HTTP requests). Options, not yet decided between:

- **(a) A cron-like job** (systemd timer or fazle-core scheduler-style)
  that periodically POSTs a fixed "check X" prompt to `hermes-runner`,
  same as a manual chat message, and only escalates (sends the Owner a
  WhatsApp message) if Hermes's response indicates something's wrong. Real
  cost: a scheduled job burning LLM inference on every tick, whether or
  not anything's wrong.
- **(b) Deterministic health checks** (cheap, no LLM) that only invoke
  Hermes when a threshold is already crossed (e.g. reuse fazle-core's own
  `health_summary`/`bridge_watchdog`/`dlq_alert` scheduler jobs, which
  already do exactly this and already notify admin) — Hermes's role here
  would be to *investigate and explain* an already-detected anomaly, not
  to *detect* it in the first place. This reuses proven infrastructure
  instead of building a parallel LLM-based watchdog.

**Recommendation to bring to the Owner:** option (b) — fazle-core's
scheduler already has 5+ jobs doing exactly this kind of proactive
monitoring (`dlq_alert`, `health_summary`, `agent_incident_summary`,
`stale_escort_reminder`, `backup_staleness_alert`, `bridge_watchdog`) and
already notifies admin via `daily_admin_digest`/direct alerts. Wiring
Hermes in as the "investigate this specific alert" step (triggered by an
admin forwarding/reacting to an existing alert) is far cheaper and safer
than a new always-on LLM polling loop, and doesn't duplicate infrastructure
that already works.

**Owner decision needed:** (a) vs (b) vs both; if (a), how often and what
LLM-cost budget is acceptable.

---

## 6. Phase 6 — WhatsApp reply/send capability (highest risk, do last, needs its own dedicated approval)

**This is the "Jarvis via bridge3" idea from earlier this session,
explicitly deferred — this phase does not un-defer it. It's documented
here so the plan is complete, not as a green light.**

**What "reply to Admin, reply to others as Admin's permission" would
require, concretely:**

1. **A real MCP/tool wrapper for a WhatsApp bridge** (bridge3, or another)
   — doesn't exist today, confirmed. This alone is a real build (HTTP
   client against the bridge's API, message read/send, likely reusing the
   `enqueue_outbound`/`fazle_draft_replies` patterns already proven this
   session rather than a raw send).
2. **A trust/identity model for "who is Hermes allowed to message, and
   as whom"** — replying *to the Admin* (status updates, findings, asking
   for clarification when confused, exactly as the Owner described for the
   deferred bridge3 idea) is materially lower-risk than replying *to
   others* "as Admin's permission" (impersonating/acting on the Owner's
   behalf to a third party) — these should likely be two separate
   capabilities with separate gates, not one toggle.
3. **Reuse, don't reinvent, this session's review-queue pattern** for
   anything Hermes drafts for a non-Admin recipient — `fazle_draft_replies`
   + `APPROVE`/`REJECT`, exactly as just built for `social_auto_reply`'s
   AI-polished replies. Replying directly to the Admin (status/questions)
   is a different, lower-risk case that doesn't need the same gate — the
   Admin *is* the approver already.
4. **"Don't give overlapping order, conflicting order, and if gaps/
   confused about questions/message, ask admin"** (Owner's own framing,
   this session) — this needs an explicit conflict-detection design, not
   just a prompt instruction. fazle-core's own `admin_directives` module
   has real, tested patterns for exactly this class of problem
   (rate-limiting, fail-closed permission checks) — study before building.
5. **PII/masking rule already documented** (`AI_ROLES_POLICY.md`'s "Data
   Display Rules" section, this session) applies directly here — any
   phone number Hermes surfaces to a non-admin context must be masked.
   Since WhatsApp replies to third parties are inherently non-admin
   context, this rule is directly load-bearing for this phase.

**Risk:** highest in this whole plan — real external communication,
potential impersonation concerns, the exact class of risk this session's
entire fazle-core work (persona system, review queue, never-auto-send
topics) was built to guard against, just for a *different* sender (Hermes
acting for the Owner, not fazle-core's own automated reply system).

**Owner decision needed, explicitly, before any code:**
1. Un-defer bridge3 (or choose a different channel) — a fresh, specific
   go-ahead, not inferred from this plan being written.
2. Confirm the two-tier model (reply-to-Admin vs. reply-to-others-as-Admin)
   as separate capabilities with separate gates.
3. Confirm reuse of the `fazle_draft_replies` review-queue pattern for the
   reply-to-others case, matching Phase 4 of the WhatsApp persona work.
4. What mode tier gates each tier (suggest: reply-to-Admin available in
   BUILD mode; reply-to-others-as-Admin requires RUN mode at minimum, given
   real-world effect).

---

## Suggested order for next session

1. Phase 1 (message metrics) — near-zero risk, high immediate value,
   start here.
2. Phase 2 (reporting convention) — low risk, mostly organizational.
3. Phase 5-b (wire Hermes into existing scheduler alerts as an
   investigator, not a new watchdog) — reuses proven infrastructure.
4. Phase 4 (trial fix/implement task through Hermes specifically) — before
   trusting Hermes with anything higher-stakes, prove it on something
   low-stakes and well-understood.
5. Phase 3 (targeted task execution via the existing scheduler) — once
   Phase 4's trial builds confidence.
6. Phase 6 (WhatsApp reply/send) — last, and only with its own explicit,
   dedicated Owner approval separate from this plan's existence — the
   highest-risk phase should never be greenlit by default just because a
   plan document mentions it.

## Related

`AI_ROLES_POLICY.md` (role matrix, mode system detail), fazle-core's
`knowledge_base/00_governance/management_decisions.md` ("Bridge3 — Current
State & Decision", "WhatsApp persona reply" work — same session, same day),
`proposal_hermes_whatsapp_persona_reply_20260803.md` (the review-queue
pattern this plan's Phase 6 reuses), `progress_gap_next_implement_queue.md`.
