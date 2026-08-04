# Hermes Phase 5 — Proactive Monitoring (Detect → Investigate → Report)

**Status:** Phase 5A IMPLEMENTED, TESTED, RUNTIME VERIFIED — same day,
2026-08-04, later session. Architecture decision (§1) resolved: option
(a), on-demand pull, exactly as recommended, zero new fazle-core code.
See `HERMES_FULL_CAPABILITY_PLAN_20260803.md`'s Phase 5 section for the
full result summary, including a real production bug (`daily_admin_digest`
`KeyError: 'payment_method'`) found live during verification and correctly
left unfixed (Report only, no auto-fix, per this doc's own §5 non-goals).
Originally written 2026-08-04 (earlier same day) for the next session, per
Owner request, as a direct follow-on to the six foundational Hermes
capabilities (metrics, reporting, PII masking, audit toolkit, scheduler
execution, mode TTL — all implemented, tested, and runtime-verified) and
the real Hermes BUILD/RUN lifecycle trial that proved Hermes can be
trusted with a supervised, confirmed, low-stakes fix/implement task
end-to-end.

**Owner's explicit staged roadmap for this capability (do not skip ahead):**
1. **This phase — Detect → Investigate → Report.** No auto-fix.
2. *Later, separate phase* — Detect → Investigate → Propose Fix → Ask
   Approval.
3. *Much later, separate phase* — Detect → Investigate → Fix → Verify →
   Report.

Do not implement stage 2 or 3 as part of this task. This document scopes
stage 1 only.

---

## 0. What's already true, verified 2026-08-04 — don't rebuild these

- **fazle-core already detects and alerts today, independent of Hermes.**
  Six scheduler jobs already do proactive read-only health checking and
  already notify the Owner directly via WhatsApp when something's wrong:
  `dlq_alert`, `health_summary`, `agent_incident_summary`,
  `backup_staleness_alert`, `bridge_watchdog`, `daily_admin_digest`. Verified
  by reading `modules/scheduler/__init__.py` directly — e.g.
  `job_health_summary()` calls `_build_health(deep=False)`, and on a
  non-`ok` result calls `outbound.enqueue(admin, msg, ...)` with an
  idempotency key (a 6h-bucketed key so it doesn't spam). `job_dlq_alert()`
  follows the identical pattern with a day-based key. **This detection and
  Owner-notification path is not being replaced or duplicated by this
  phase** — it keeps working exactly as it does today, unmodified.
- **fazle-core's `GET /scheduler/status` (already built, already
  `require_api_key`-gated, no new fazle-core code needed) is the ideal data
  source for "what's currently wrong."** Verified exact response shape by
  reading `modules/scheduler/__init__.py`'s `get_status()`:
  ```json
  {
    "enabled": true, "tz": "...",
    "jobs": [
      {"job_name": "dlq_alert", "last_run_at": "...", "last_status": "ok"|"error"|null,
       "last_duration_ms": 123, "last_error": null|"...", "next_run_at": "...", "run_count": 42},
      ...
    ]
  }
  ```
  `last_status`/`last_error` per job is exactly the signal needed to decide
  "is there something to investigate right now" — no polling, no new
  fazle-core endpoint, just a new caller.
- **Hermes's foundational infrastructure (all live, all reusable):**
  `fazle-mcp/fazle_core_client.py` (the HTTP client to fazle-core's own app,
  `FAZLE_CORE_API_KEY` already provisioned — see
  `core/scripts/create_hermes_mcp_admin.py`), `fazle-mcp/report_schema.py`
  (`build_report()` — reusable structured+text report shape, already
  proven via `get_social_report`), `fazle-mcp/audit_tools.py` (7 read-only,
  rooted, path-traversal-safe tools: code/docs/KB search, log search
  across `backend` (Docker logs)/`fazle-core` (file)/`hermes-runner`
  (journal), bounded file read, git status/log), `fazle-mcp/pii_mask.py`
  (centralized masking, apply to anything touching contact/phone data).
  **Extend these, don't parallel-build.**
- **Hermes's mode gate and confirm-before-destructive are proven live**,
  including a real end-to-end BUILD→RUN trial (2026-08-04, see
  `HERMES_FULL_CAPABILITY_PLAN_20260803.md`'s Phase 4 section for the full
  transcript). Everything in this phase is read-only investigation, so it
  should live in the always-available toolset (no mode gate needed) — same
  reasoning already applied to the audit toolkit.
- **`HERMES_FULL_CAPABILITY_PLAN_20260803.md`'s original Phase 5 section**
  already framed this exact choice and recommended option (b) — "Hermes's
  role is to *investigate and explain* an already-detected anomaly, not to
  *detect* it in the first place" — over a new LLM polling loop. This
  document is that recommendation, made concrete and buildable.

## 1. The one open architecture decision — resolve with the Owner before writing code

The Owner's own diagram is: `Existing fazle-core alerts → Hermes receives
alert → Hermes investigates → ...`. "Receives alert" needs a concrete
mechanism. Two honest options, recommend (a):

**(a) Recommended — on-demand pull, zero new fazle-core code.** Hermes
gets a new read-only tool (`get_monitoring_status()`, see Task 1) that
calls the existing `/scheduler/status` and reports which of the 6 monitored
jobs are currently non-`ok`. "Receiving" the alert means: the Owner is
already notified today via the existing WhatsApp path (unchanged), and
separately, at any time, can ask Hermes ("check monitoring status" / "any
alerts?" / "investigate the DLQ") and Hermes pulls fresh state on that
request — not a loop, not autonomous, purely reactive to a human ask. This
satisfies "no new always-on LLM polling loop" and "no auto-fix" by
construction, and needs zero new fazle-core surface.

**(b) Deferred — real push.** fazle-core's existing alert-sending code
(`outbound.enqueue(admin, ...)` call sites in the 6 jobs) gets a small
additional hook to also `POST` the alert to a new `hermes-runner` endpoint,
which queues it (a small on-disk file, not a DB) for Hermes to notice next
time it's asked. This is a **real fazle-core code change** (touching
production alert-sending paths) and needs its own dedicated Owner sign-off
and KB-first proposal cycle — do not build this as part of this phase
without that explicit, separate approval. If the Owner wants "Hermes gets
pinged the moment an alert fires" rather than "Hermes checks when asked,"
this is the option to propose separately.

**Default for this phase: build (a) only.** Confirm with the Owner before
starting if that's not the intent.

## 2. Task 1 — Monitoring status tool (read-only, extends existing pattern)

- New `fazle-mcp/monitoring_tools.py` (or add to `metrics_tools.py` if it
  stays small — decide based on how large it gets), following the exact
  pattern already proven by `get_social_status`:
  - `MONITORED_JOBS = {"dlq_alert", "health_summary", "agent_incident_summary", "backup_staleness_alert", "bridge_watchdog", "daily_admin_digest"}` — the 6 already-alerting, read-only jobs. (Re-verify this list is still accurate at implementation time — `modules/scheduler/__init__.py`'s job registry is the source of truth, not this document.)
  - `get_monitoring_status()` — calls `fazle_core_client.get("/scheduler/status")`, filters/annotates to just the monitored jobs, returns each with a normalized `state`: `"ok"` (`last_status == "ok"`), `"alerting"` (`last_status == "error"` or `last_error` set), `"stale"` (`last_run_at` older than some sane threshold per job — e.g. `dlq_alert` should run every 15min, `daily_admin_digest` daily; define per-job expected cadence, don't hardcode one global threshold), `"never_run"` (`last_run_at` is null).
  - Register as a new `@mcp.tool()` in `fazle-mcp/server.py`, always-available toolset (no mode gate — read-only).
- Tests (new `fazle-mcp/tests/test_monitoring_tools.py`, mirror
  `test_metrics_tools.py`'s structure): mocked success across all state
  combinations (ok/alerting/stale/never_run), unreachable/timeout/
  unauthorized fazle-core, empty jobs list, a monitored job missing from
  the response entirely (fail gracefully, don't crash).

## 3. Task 2 — Investigation + structured report tool

- `get_monitoring_report()` in the same module, composing:
  1. `get_monitoring_status()` for the current snapshot.
  2. For any job in `"alerting"` or `"stale"` state: pull supporting
     evidence via the **existing** audit toolkit — `audit_search_logs`
     against the relevant log source (map job → log source sensibly, e.g.
     `bridge_watchdog`/most jobs → `fazle-core`; if a job's failure looks
     deploy-related, `audit_recent_commits(repo="fazle-core")` for
     recent changes). Keep this mapping simple and explicit, not a
     general-purpose "investigate anything" free-for-all — bounded,
     predictable evidence-gathering per job state, matching this
     project's existing "narrow, named tools, not a generic escape hatch"
     philosophy (see `audit_tools.py`'s own design rationale).
  3. Feed everything into `report_schema.build_report()` (already built,
     reused as-is) — `status` derived from worst job state present
     (`CRITICAL` if any `alerting`, `DEGRADED` if any `stale`, `HEALTHY`
     otherwise), `metrics` = the per-job status table, `evidence` = the
     audit toolkit's findings, `findings`/`problems` = human-readable
     per-job issue descriptions, `risk`/`recommendations`/
     `action_required` = derived same way `get_social_report()` already
     does it.
  4. Returns `{"structured": {...}, "text": "..."}` exactly like every
     other report tool already does — Hermes's own LLM narration is not
     the source of truth for the report's shape, the tool is (matching
     this session's own established preference for deterministic
     tool-composed reports over free-form narration).
- Tests: healthy (all ok), one job alerting (with mocked log evidence
  attached), one job stale, multiple simultaneous issues, fazle-core
  entirely unreachable (report should degrade to `UNKNOWN`/`CRITICAL`
  gracefully, matching `get_social_report`'s existing precedent for that
  exact case).

## 4. Task 3 — "Owner notified" (keep this minimal, per the Owner's own framing)

Do **not** build a new notification channel. The Owner is already notified
by fazle-core's existing WhatsApp alerts (§0) — unchanged, not this
phase's concern. What this phase adds is the *deeper, on-demand
explanation* once the Owner is already aware something needs a look,
reachable by asking Hermes on the existing `/hermes` page. Two optional,
genuinely low-cost additions worth considering (not required for a
minimal v1, confirm with Owner which if any are wanted):
- **Report persistence** (was already scoped, never built, in
  `HERMES_FULL_CAPABILITY_PLAN_20260803.md`'s original Phase 2): write
  each `get_monitoring_report()` call's `text` to a timestamped file under
  a new `assistant-platform/reports/` directory (or similar), so a report
  survives past the chat scrolling away. Pure filesystem write, no new
  service, no new risk surface.
- **A dedicated "check monitoring" quick-action** on the Hermes page
  (frontend, `HermesPage.jsx`) that sends a fixed, pre-written prompt
  ("check monitoring status, investigate anything alerting, give me a
  report") — saves the Owner from having to type it, still 100%
  on-demand, not automated.

## 5. Explicit non-goals for this phase

- No auto-fix, no proposed-fix-and-wait-for-approval (that's stage 2 of
  the Owner's roadmap, a separate future task).
- No new always-on LLM polling loop, no cron-triggered Hermes invocation.
- No new fazle-core webhook/push mechanism (§1 option (b)) without a
  separate, dedicated Owner sign-off.
- No WhatsApp send/reply capability — still Owner-deferred (bridge3,
  `management_decisions.md` 2026-08-03) and unrelated to this phase.
- No changes to the 6 existing scheduler jobs' own alerting logic —
  read from them, never modify them.

## 6. Security requirements

- Everything in this phase is read-only against fazle-core (same
  `require_api_key`-gated `/scheduler/status`, same dedicated admin
  identity already provisioned — no new credential needed).
- Reuse the existing audit toolkit's allowlists/denylists as-is — do not
  loosen `AUDIT_ROOTS`, `DENY_PATH_SUBSTRINGS`, or `EXCLUDE_DIRS` to
  accommodate this phase; if a genuinely new root is needed, that's a
  deliberate, separate, reviewed change, not a side effect.
- If report persistence (§4) is built: written files must not contain
  unmasked PII — none of the 6 monitored jobs' status/error output is
  expected to carry contact PII, but re-verify this assumption against
  real `last_error` text at implementation time before assuming it's safe
  to write to disk unmasked.

## 7. Testing

- Follow this session's own established conventions exactly: `unittest` +
  `unittest.mock` in `fazle-mcp/tests/`, no new dependencies. Mock
  `fazle_core_client.get`, never hit the real network in unit tests.
- After unit tests pass, live-verify against the real, already-provisioned
  fazle-core connection (same pattern as the six-capability session's own
  runtime verification) — call `get_monitoring_status()`/
  `get_monitoring_report()` for real, confirm the shape and a sensible
  HEALTHY result against current real state.

## 8. Files likely touched

**New:** `fazle-mcp/monitoring_tools.py` (or extend `metrics_tools.py`),
`fazle-mcp/tests/test_monitoring_tools.py`, optionally
`assistant-platform/reports/` (if report persistence is built).
**Modified:** `fazle-mcp/server.py` (register new tool(s)),
`HERMES_FULL_CAPABILITY_PLAN_20260803.md` (mark Phase 5a done),
`AI_ROLES_POLICY.md` (only if anything here changes an enforcement claim —
likely not, this is purely additive read-only capability).
**Not touched:** fazle-core (read-only throughout, per §1 option (a) —
if the Owner instead wants option (b), that's explicitly a separate,
larger, dedicated task, not a same-session extension of this one).

## 9. Verification plan

- Unit tests green, then live calls against real fazle-core (no
  Docker rebuild needed unless `fazle-mcp/server.py`'s tool registration
  changed — it will, so `fazle-mcp` picks it up on its next spawn
  automatically, same as every prior fazle-mcp change this session; no
  service restart required for fazle-mcp itself).
- A real end-to-end Hermes conversation trial (mirroring the Phase 4
  BUILD/RUN trial's rigor): ask Hermes to check monitoring status for
  real, and if everything's healthy at the time, deliberately don't fake
  a failure — report the honest HEALTHY result, same as the Phase 4
  trial's own honest "nothing worth fixing" result was itself a
  meaningful, positive signal.

## 10. Final report format

Follow the same structure that worked well for the six-capability session:
Executive Summary; Pre-Implementation Findings (re-verify §0's claims
fresh, don't trust this document's file:line references without
re-checking — code moves); per-task Implemented/Files/Tests/Verification
status; Documentation Updated; Tests Run; Security Findings; Deployment
Status; Remaining Work; Recommended Next Step (should point at Owner
roadmap stage 2 — Propose Fix → Ask Approval — as the natural next
phase, not skip further ahead).

## Related

`HERMES_FULL_CAPABILITY_PLAN_20260803.md` (original Phase 5 framing, now
superseded in detail by this document), `AI_ROLES_POLICY.md`,
`progress_gap_next_implement_queue.md`, `fazle-mcp/metrics_tools.py` +
`report_schema.py` (the direct pattern this phase extends),
`core/modules/scheduler/__init__.py` (source of truth for the job
registry and `get_status()` — re-read fresh, this document's quoted
shapes are a snapshot from 2026-08-04).
