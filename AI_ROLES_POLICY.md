# AI Roles Policy — Chat / OpenCode / Hermes / Admin

**Status:** Owner-approved, 2026-08-02. Documents the target policy and,
separately and honestly, what's *actually enforced today* vs. still
planned — don't assume every line below is already technically enforced;
check the "Current enforcement" column.

## Role matrix

| Role | Can | Cannot | Current enforcement |
|---|---|---|---|
| **Chat** (`/chat`) | Read-only DB views (fazle-core, via `fazleTools.js`), web search, diagnosis/planning | Edit code/DB/files, deploy, restart, push | ✅ Fully enforced today — only tools available are the 10 read-only fazle-core queries + `web_search`, no write path exists at all in `chat.js`. KB/repo/log/runtime-status read tools (the fuller "audit toolkit") are **not built yet** — deferred, see Next steps. |
| **OpenCode** (`/opencode`, admin-only as of 2026-08-03) | File/code edit, patch prepare, run tests/lint/troubleshoot | Final deploy, git push, restart, DB schema apply without admin action | ✅ Access gated: `requireAdmin` on the backend route + nav hidden from non-admin users (2026-08-03, reversing an earlier same-day narrowing to `/home/azim/assistant-platform` only). Scope: `opencode serve`'s own agent has real file-edit/shell capability across the whole `/home/azim` — deliberately, since only the same person who already has direct SSH/sudo to the box can reach it now. No deploy/push/restart tool is wired into it via assistant-platform. **If OpenCode is ever reopened to non-admin users, the directory-scope restriction must come back with it** — the two decisions are a pair, not independent (see `progress_gap_next_implement_queue.md`). |
| **Hermes** (`/hermes`, admin-only) | Chat + OpenCode + special long-running operational functions | Autonomous code/DB/file change without confirmation; production-effect action without admin gating | ✅ Mode system built and live (2026-08-03): READ/BUILD/RUN, enforced by gating which Hermes toolsets are available per mode (`hermes-runner/server.py`'s `MODE_TOOLSETS`), fail-closed to READ if the approval file (`hermes-runner/current_mode.txt`) is missing/unreadable — verified live via an unauthenticated request and a missing-file case. Mode is admin-changeable via `GET/POST /api/hermes/mode`, UI confirmation required to escalate to BUILD/RUN. **TTL/auto-revert built 2026-08-04** — a mode change can now carry an expiry (`ttl_seconds`, TIME/TASK/SESSION scope), actively and persistently reverts to READ on expiry (see "Mode TTL / auto-revert" note below). Persona picker also built and live: 14 personas from `~/.hermes/config.yaml`, per-session, admin-only. Confirm-before-destructive still verified live independently of the mode system. |
| **Admin** (human, via SSH/VPS access) | Final authority: sudo, DB DDL, commit/push/restart, approval grant/revoke | — | This is the human Owner, not software — always fully authoritative. |

## Why Hermes should move to mode-based, not always-full-power

Recommended (Owner-agreed direction, not yet implemented): Hermes should
have three modes — **Read/Plan** (≈ Chat), **Build** (≈ OpenCode),
**Run** (special operations — anything with a real external effect) —
with **Run mode requiring an active admin approval grant** to be usable at
all, not just a per-action confirmation prompt. Rationale: always-on full
power means every single interaction carries the same blast radius as the
riskiest one; mode-gating means the capability exists but only unlocks
with context, and stop/pause is a single admin action (revoke the grant)
rather than needing to interrupt an in-flight session.

**Before building this**, note: fazle-core already has its own, separate,
more mature version of exactly this pattern — `modules/admin_directives`
+ `modules/rbac` (RBAC roles: `viewer`/`office_assistant`/`operator`/
`accountant`/`admin`/`superadmin`; fail-closed permission checks;
`fazle_admin_directives` table for persistent admin instructions;
rate-limited WhatsApp admin commands `AI`/`AUTOREPLY`/`REMEMBER`/`SEND`,
the last one being the one exception to "AI Console tools are read-only";
see `management_decisions.md`'s "Unified Admin AI Engine" entry,
2026-07-30). This is a **different system** (fazle-core's own internal
admin AI, reached via WhatsApp) from Hermes (assistant-platform's agent,
reached via the web page) — they are not the same thing and don't need to
merge — but the *design pattern* (fail-closed RBAC, an explicit
persistent-approval record, rate limiting, output sanitization, full
audit logging) is proven, already built, and worth studying before
inventing a parallel approval-file mechanism from scratch for Hermes.

## Next steps (not built yet, in priority order per Owner's plan)

1. ~~Chat audit toolkit~~ **Built for Hermes instead, 2026-08-04** —
   read-only code/docs/KB search, log search (secrets- and PII-redacted),
   bounded file read (denylist: `.env`, `secrets/`, `private_key`, `.pem`,
   `.key`, `id_rsa`, `credentials`), git status/recent-commits — all rooted
   to an explicit allowlist (`assistant-platform`, `fazle-core`), argv-list
   subprocess calls only (no shell=True anywhere). Lives in
   `fazle-mcp/audit_tools.py`, 7 new MCP tools, always-available (no mode
   gate — inherently read-only/bounded). **Not wired into Chat's own tool
   list** (`fazleToolDefinitions` in `chat.js`) — this session's task scope
   was specifically Hermes; extending it to Chat too is a small, separate
   follow-up if wanted. WhatsApp reply-audit trace and "runtime status"
   specifically were not built (out of this session's scope). 30 tests,
   all passing. **RUNTIME VERIFIED, 2026-08-04 (later same day)** against
   the real filesystem/git repos/logs, not mocks — found and fixed two real
   bugs in the process: (1) `audit_search_logs`'s `backend`/`hermes-runner`
   entries pointed at file paths that don't exist (`assistant-backend` logs
   via Docker's own driver, no host file; `hermes-runner.service` has no
   `StandardError=` file redirect — a stale server.py comment claimed
   otherwise, real source is the systemd journal) — now dispatches to
   `docker compose logs` / `journalctl --user` respectively, verified live
   returning real log lines from both; (2) `audit_search_code` surfaced
   noise from an auto-generated `tests/coverage_html/` directory (a real
   HTML coverage dump, thousands of lines) — added to `EXCLUDE_DIRS`,
   re-verified the same search comes back clean. Path-traversal and
   secrets-denylist protections both confirmed live refusing real attempts
   (`.env`, `../../../etc/passwd`).
2. ~~Hermes control plane~~ **Done (2026-08-03)** — mode system + approval
   file, see the role matrix row above. ~~Remaining gap: no TTL/auto-revert~~
   **TTL/auto-revert done 2026-08-04**, see below. Still no stop/pause/
   resume semantics for an in-flight session specifically (mode change
   affects the *next* call, not one already running) — unchanged, out of
   this session's scope.
3. **Full Hermes capability (WhatsApp reply, monitoring, task execution,
   reporting, message metrics)** — see the dedicated instructional plan,
   `HERMES_FULL_CAPABILITY_PLAN_20260803.md`, written 2026-08-03 for the
   next session. Not started — planning only.

## Data Display Rules — PII and Employee Identifiers

**Status:** Owner-specified, 2026-08-03. Standing rule for all new/changed
code — not (yet) a retroactive audit-and-fix pass of existing endpoints;
see "Current enforcement" below for what's already known to violate it.

Phone numbers in fazle-core-adjacent data (`employee_id_phone` and
equivalents) are **DB-linked employee/contact identifiers**, not
throwaway contact info — treat them as PII requiring a display gate, not
just any other field.

**Display rule, by context:**

| Context | Display |
|---|---|
| Admin (admin JWT / admin-only page) | Full number, never masked — e.g. `+8801XXXXXXXXX` |
| Non-admin (any other authenticated role) | Always masked — last 4 digits only, e.g. `+880XXXXXXX7821` |

**Applies to, going forward:**
- Any Hermes output shown to non-admin users (not applicable today — Hermes
  is already admin-only, but keep this in mind if that ever changes).
- Any `fazleBridge.js` endpoint or `fazleTools.js` chat tool returning
  contact/employee data.
- Any UI component rendering employee or contact phone numbers.
- Any log output a non-admin user can read.

**Enforcement pattern:**

```js
const display = user.role === 'admin' ? fullPhoneNumber : maskPhone(fullPhoneNumber);
// maskPhone: keep a country/format prefix + last 4 digits only, mask the rest
```

**Current enforcement — CLOSED, 2026-08-04:** the gap described above (any
approved non-admin user could retrieve full, unmasked phone numbers via
`fazleBridge.js`'s `/contacts`/`/recruitment-leads` or the matching
`fazleTools.js` chat tools) is fixed. A centralized masker,
`backend/src/lib/piiMask.js` (`maskPhone`/`maskPiiInObject`), is now applied
at the query choke point in both files — `fazleBridge.js`'s `readOnlyQuery()`
masks every response by field name (not per-route), and `fazleTools.js`
threads `isAdmin` from `chat.js`'s `req.user.role` into `executeFazleTool()`.
Widened during the fix, past the two originally-known routes: `/messages`
(`sender_number`) and `/escort-programs` (`escort_mobile`) had the identical
bug and are now covered too. Format implemented exactly as specified above
(prefix + last 4 digits). Python counterpart for fazle-mcp's own new tools:
`fazle-mcp/pii_mask.py` (deliberately duplicated, not shared — matches this
project's existing cross-process duplication convention). Regression tests:
`backend/tests/piiMask.test.js`, `fazle-mcp/tests/test_pii_mask.py`.
**RUNTIME VERIFIED, 2026-08-04**, live against the rebuilt+restarted
`assistant-backend` container and real production contact/lead/message/
escort data (JWTs minted server-side inside the container for a real seeded
admin and non-admin account, no password reset needed): admin got
`8801893037242` unmasked on `/contacts`; the same row masked to
`880XXXXXX7242` for non-admin. Verified across all 4 fixed routes
(`/contacts`, `/recruitment-leads`, `/messages`, `/escort-programs`).
**Residual gap CLOSED, 2026-08-04 (later same day):** the free-text gap
above is fixed. `maskPiiInObject`/`mask_pii` now also accept `textFields`
(default `TEXT_SCAN_FIELDS = {'message_body'}`) — fields scanned for an
embedded phone-shaped substring (`PHONE_IN_TEXT_RE`/`_PHONE_IN_TEXT_RE`,
identical pattern in both `piiMask.js` and `pii_mask.py`) and masked in
place, rather than the whole field being masked. **RUNTIME VERIFIED**
against the exact real row that first surfaced the gap: `message_body`
went from `"...নগদ পার্সোনাল : 01339620136"` to `"...নগদ পার্সোনাল :
0XXXXXX0136"`, surrounding text untouched, `sender_number` still correctly
masked. 9 new regression tests (`backend/tests/piiMask.test.js`,
`fazle-mcp/tests/test_pii_mask.py`) — 36 + 88 total across the two suites,
all passing.

**Mode TTL / auto-revert — DONE, 2026-08-04** (closes the "Next steps" item
below): `hermes-runner/server.py`'s mode file now supports an optional
expiry (`ttl_seconds`, 60–86400s bounds) and scope (TIME/TASK/SESSION).
Expiry is actively enforced — the persisted file itself reverts to READ the
moment expiry is discovered on any read, not just logically treated as
such, so it survives a service restart and can't silently stay elevated.
TASK/SESSION scope is a metadata + conservative-default-TTL approximation
(this shim has no real per-session lifecycle hook) — documented, not
oversold as a true session-boundary. `POST /api/hermes/mode` now accepts
`ttl_seconds`/`scope`; `GET` reports `expires_at`/`seconds_remaining`/
`expired`. Every mode change is now audit-logged
(`hermes-runner/mode_audit.log`). Tests: `hermes-runner/tests/test_mode_ttl.py`
(27 tests, including concurrent-near-expiry and fail-safe-on-corruption
cases). **RUNTIME VERIFIED, 2026-08-04**, live against the restarted
`hermes-runner.service`: set BUILD with a real 60s TTL via `POST /mode`,
confirmed `seconds_remaining` counting down, then genuinely waited out the
full 60s (not simulated) — the mode auto-reverted to READ, the on-disk file
was rewritten (not just the in-memory response), and `mode_audit.log`
recorded both the `mode_change` and `auto_revert_expired` events. TTL
bounds validation (60–86400s) also confirmed live: a 5s and a 999999s
request were both correctly rejected with 400.

## Related

`proposal_ai_read_cash_transactions_20260802.md` (the specific feature
that prompted writing this policy down), `progress_gap_next_implement_queue.md`
(technical state/gotchas for Chat/OpenCode/Hermes), fazle-core's
`knowledge_base/00_governance/CANONICAL_BUSINESS_RULES.md` §AI Console
(the equivalent policy for fazle-core's *own* internal AI tools — a
different system, same non-negotiable shape: no raw SQL, no arbitrary
write, no direct message send without a human step).
