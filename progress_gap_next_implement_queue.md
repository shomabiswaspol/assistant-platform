# Assistant Platform — Progress, Gaps & Next Implementation Queue

**Last updated:** 2026-08-04 (later same day). **Six foundational Hermes
capabilities implemented, unit/integration TESTED, and now RUNTIME
VERIFIED** (metrics, structured reporting, PII masking fix, read-only
audit toolkit, scheduler task execution, mode TTL/auto-revert) — see the
session's full implementation report for the 14-section detail. Summary:
133 new tests across three codebases (backend 27, fazle-mcp 79,
hermes-runner 27), all passing; `assistant-backend` rebuilt+restarted,
`hermes-runner.service` restarted, both healthy. Runtime verification
performed for real, not simulated: PII masking checked against real
production contact/lead/message/escort rows (admin vs non-admin, correct
masking both times); mode TTL set to a genuine 60s expiry and watched
auto-revert live, persisted file + audit log both confirmed; a dedicated
fazle-core admin identity (phone `01958122304`, role `viewer`, `admin_id
39`, created via `core/scripts/create_hermes_mcp_admin.py`) was minted and
its API key wired into `~/.hermes/config.yaml`'s `FAZLE_CORE_API_KEY`,
after which metrics/report tools returned real live queue/status data and
`run_scheduled_task` genuinely triggered fazle-core's real `health_summary`
job end-to-end, then mode was explicitly reverted to READ afterward. New
files: `fazle-mcp/{fazle_core_client,metrics_tools,report_schema,pii_mask,
audit_tools,scheduler_tools}.py` + `fazle-mcp/tests/`,
`backend/src/lib/piiMask.js` + `backend/tests/`, `hermes-runner/tests/`,
`core/scripts/create_hermes_mcp_admin.py` (new fazle-core admin identity,
one-time setup, already run). Modified: `fazle-mcp/server.py` (7→18 tools
registered), `backend/src/routes/{fazleBridge,hermes,chat}.js`,
`backend/src/tools/fazleTools.js`, `hermes-runner/server.py` (mode file
format change, backward-compatible with the legacy bare-word format),
`~/.hermes/config.yaml` (new env vars, `FAZLE_CORE_API_KEY` now live).
**Real PII exposure bug fixed and runtime-verified as part of this work**
(was a known, documented gap in `AI_ROLES_POLICY.md`) — see that file's
"Data Display Rules" section for detail, widened past the two
originally-known routes to two more found during the fix (`/messages`,
`/escort-programs`). One honest residual gap found live and documented,
not fixed: `/messages`' free-text `message_body` can itself contain a
phone number the sender typed — structured-field masking doesn't reach
into free text. Not yet `git commit`/pushed (same as the state below) — do
that before trusting `git log` over this doc.

---

**Previous update, 2026-08-03 (later same day), uncommitted local changes on
top of commit `a107983`.** **A full gap-fix pass closed 6 of the 8 items in
§3's table in one session**: fazleBridge.js's module-bridge-status column
bug, BYO API keys wired into chat.js, real usage/quota tracking, the Hermes
persona picker, the Hermes READ/BUILD/RUN mode gate, and the password-reset
email flow (all built, rebuilt, redeployed, and live-verified — not just
written). Two items remain genuinely open, both blocked on the Owner, not
on more building — see §3 and §5.

**Cash-transactions AI access is fully live and verified end-to-end**
(unchanged from the prior update) — `ai_read_cash_transactions` view exists
in production, Chat and Hermes both confirmed answering real questions
correctly (15 transactions, ৳6,200.00 on 2026-08-01, matching direct SQL).
OpenCode and Hermes remain fully live via the real public HTTPS API.

**Repo:** `/home/azim/assistant-platform/` (bare-metal VPS, Docker Compose,
not inside `/home/azim/core` — see gotchas). Deployed live at
`assistant.iamazim.com`. fazle-core lives at `/home/azim/core` — a
separate git repo, separate GitHub account (`arshiyaazim/fazle-core`),
production system this project only reads from.

This file is written for an AI agent picking up this project cold. It
states what exists right now (verified against the live code/DB, not
assumed — re-verify claims yourself before trusting them, including this
doc's own claims), the non-obvious facts that will cost you time if you
don't know them, and an ordered queue of what to build next. Update this
file whenever you finish a queue item or discover a fact that would have
saved you time. **Never mark something "done" here without directly
re-checking it — this doc itself was wrong once (the nginx timeout) from
someone assuming a fix landed rather than confirming it.**

**Mission:** one ChatGPT-style web app (desktop + mobile) where chat can
search the web, read fazle-core's DB, run VPS commands and fix code via
Hermes Agent, and pull tokens from a free/local/paid provider mix via
OmniRoute. WhatsApp reply is shelved (see §5).

---

## 1. Current state (verified)

**Infra:** nginx → frontend (React/Vite/Tailwind v4, :3000) + backend
(Express, :3001) + Postgres + Redis + OmniRoute, all Docker Compose,
`restart: unless-stopped`. Build/deploy loop:
```
cd /home/azim/assistant-platform
docker compose build <service>   # assistant-backend | assistant-frontend
docker compose up -d <service>
docker compose logs <service> --tail=30
```

**Auth:** register → admin approve/deny → JWT login. Working end to end
except password-reset email (stub, see §3).

**Chat (`backend/src/routes/chat.js`):**
- Text/voice/image chat via OmniRoute, session history, markdown rendering.
- **Tool-calling is live** — `sendTextMessage()` gives the model 13 tools
  (12 fazle-core DB reads, including `get_cash_transactions` and
  `get_cash_transactions_summary` as of 2026-08-03, + `web_search`) and
  runs the tool_call → execute → feed-back loop. Tool-enabled calls are
  pinned to `groq/llama-3.3-70b-versatile` (`TOOL_CAPABLE_MODEL` constant),
  retried up to 3x on failure before falling back to no-tools/`auto` —
  even with this, **still occasionally falls back on the first attempt**
  (confirmed live, 2026-08-03: 1 of 3 identical requests fell back to the
  unreliable `auto` router and gave a correctly-honest-but-wrong "I don't
  have access" answer before a retry succeeded). Not a regression, just a
  reminder this is probabilistic, not deterministic — see gotchas.
- **Real bug found+fixed, 2026-08-03: the model can get correct data wrong
  through bad arithmetic.** Asked for a specific date's total cash
  transactions — `get_cash_transactions` correctly returned all 15 real
  rows (verified against a direct DB query), but the model summed them to
  ৳5400 instead of the real ৳6200 in its own generated text. Not a
  data-access bug — a manual-summation weakness. Fixed by adding
  `get_cash_transactions_summary` (`fazleTools.js`), which computes
  `COUNT`/`SUM`/`AVG` and a by-category breakdown **in SQL**, never asking
  the model to add rows up itself; its description explicitly tells the
  model to prefer it over manual summation. Re-tested the exact same
  question after the fix: ৳6200.00, 15 transactions, ৳413.33 average — all
  correct. **This same weakness likely applies to any other tool a user
  asks for a total from** (payroll, billing) — only cash transactions has
  a dedicated summary tool so far; extend the pattern if the same bug shows
  up elsewhere.
- Tools live in `backend/src/tools/fazleTools.js` (queries the
  `fazle_ai_reader` pool **directly**, not via HTTP — see gotchas) and
  `backend/src/tools/searchTools.js` (Tavily; `TAVILY_API_KEY` is set in
  `backend/.env`, confirmed working).
- Voice (`/send-audio`) and image (`/send-image`) routes don't use tools —
  untouched, single-shot as before (explicitly deferred, not a bug — Owner
  decision 2026-08-03).
- **BYO API keys are now live, scoped deliberately narrow** (Owner decision
  2026-08-03): only the no-tools fallback completion in `sendTextMessage()`
  checks `user_api_keys` for a stored key matching the selected model's
  provider and calls that provider directly (`callProviderDirect()` in
  chat.js — OpenAI-compatible providers via `/chat/completions`, Anthropic
  via its own Messages API shape). **Tool-enabled calls never use a BYO
  key** — they stay pinned to `TOOL_CAPABLE_MODEL` via OmniRoute always, on
  purpose, since that's the one combination confirmed reliable for
  `tool_calls`. Falls back to OmniRoute if no key is stored or the direct
  call throws.

**UI:** single sidebar (nav + chat history merged), collapse toggle
(desktop width-collapse, mobile slide-over), all 7 pages Tailwind v4,
dark/light mode. Chat session state lives in
`frontend/src/context/ChatSessionsContext.jsx`, consumed by both
`Sidebar.jsx` and `ChatPage.jsx`.

**fazle-core bridge:** `backend/src/routes/fazleBridge.js` — **11**
read-only HTTP endpoints (10 original + `/cash-transactions`, added
2026-08-03), JWT-protected, three-layer write protection. Still live and
correct for direct API use; the chat *tools* in `fazleTools.js` duplicate
its query logic rather than calling it over HTTP (deliberate — see
gotchas).

**Cash transactions (new, 2026-08-03):** `ai_read_cash_transactions` view
now exists in production, sourced **only** from `fpe_cash_transactions`
(the sole canonical cash ledger, Owner Directive 2026-06-29 — never
`wbom_cash_transactions`, which is legacy/archive only). Full audit trail:
`proposal_ai_read_cash_transactions_20260802.md`. Wired into Chat
(`fazleTools.js`), Hermes (`fazle-mcp/server.py`), and the raw bridge
(`fazleBridge.js`) — all three verified live against real data. fazle-core's
own KB (`ai_readonly_data_access.md`, `CANONICAL_BUSINESS_RULES.md`,
`management_decisions.md`) updated and pushed (commit `7b57007`) to match.

**OpenCode (`backend/src/routes/opencode.js`, `frontend/src/pages/OpenCodePage.jsx`):**
- `opencode serve` runs as a **host-level systemd user service** (not
  Docker — `~/.config/systemd/user/opencode-serve.service`, `systemctl
  --user`, no sudo needed, lingering already enabled). Config at
  `~/.config/opencode/opencode.jsonc` pins a custom "omniroute" provider so
  it draws from the same free→local→paid cascade as everything else.
- Reached from assistant-backend (Docker) via nginx's
  `/opencode-internal/` location (IP-restricted, see gotchas — do NOT try
  a direct container→host-gateway route, it doesn't work on this VPS).
- **Now admin-only** (changed 2026-08-03, same day as the finding below —
  `backend/src/routes/opencode.js` uses `requireAdmin` now, not just
  `requireApproved`; frontend nav item moved into the admin-only
  "Workspace" group in `Sidebar.jsx`, same group `HERMES_ITEM` was already
  in). Verified live: a minted non-admin JWT gets 403 on
  `/api/opencode/session`, an admin JWT gets 200.
- **Scope history, both same day (2026-08-03), worth understanding in
  order:** OpenCode's session working directory had no explicit scope —
  defaulted to the whole `$HOME` (`/home/azim`), confirmed live via its own
  session API (`location.directory`) and by asking it to list files, which
  surfaced `core/` (fazle-core), `.ssh/` (SSH private keys),
  `secure-env-backup/`, `.claude.json`, and everything else in the home
  dir — and at the time it was reachable by **any approved user**, not
  just admins, with no confirm-before-destructive gate. First fix:
  `WorkingDirectory=/home/azim/assistant-platform` (scope it down). Owner
  then reversed that specific choice, reasoning the two gates are a pair:
  once OpenCode is admin-only (same person who already has direct SSH/sudo
  to the whole box), a directory restriction added inconvenience without
  real safety margin. Current state: `WorkingDirectory=/home/azim` (full
  VPS again) + admin-only gate. **If OpenCode is ever reopened to non-admin
  users, the directory restriction must come back with it** — don't split
  the pair.

**Hermes (`backend/src/routes/hermes.js`, `frontend/src/pages/HermesPage.jsx`,
`/home/azim/hermes-runner/` + `/home/azim/fazle-mcp/` — host infra, not in
this git repo):**
- Own admin-only sidebar tab + `/hermes` page, deliberately separate from
  `ChatPage.jsx` (different capability tier: real terminal/file/
  code_execution access, not scoped tool-calling).
- `hermes-runner.service` (host systemd user service, Python, tiny stdlib
  HTTP shim on `127.0.0.1:8093`) shells out to the real `hermes` CLI —
  this is why it must run on bare metal, never in Docker.
- **`fazle-mcp` (host, `/home/azim/fazle-mcp/venv/`, Python `mcp` SDK
  v2.0.0) gives Hermes the same 11 fazle-core read tools Chat has** —
  registered via `hermes mcp add fazle-core`, listed explicitly in
  `hermes-runner/server.py`'s `MODE_TOOLSETS` (superseded `HERMES_TOOLSETS`
  when the mode gate was built, see below). Authenticates as a
  dedicated low-privilege service account (`hermes-mcp-svc`, `requireApproved`
  only, not admin) via the normal login endpoint — no new auth mechanism.
- **Web search tool fixed, 2026-08-03**: `web` was listed as enabled in
  `hermes tools list` but was actually non-functional — `hermes doctor`
  showed it missing every recognized search API key (`TAVILY_API_KEY`,
  `EXA_API_KEY`, etc.), confirmed live by asking it to search and getting
  an honest "I don't have that tool" (no hallucination, but no result
  either). Fixed by adding the same `TAVILY_API_KEY` Chat's `web_search`
  tool already uses to `hermes-runner/.env`, restarting the service — a
  real search with real citations (Xe.com, Bangladesh Bank, etc.) confirmed
  working immediately after.
- Confirm-before-destructive works, verified live twice now (a real
  service-restart request and a real file-write request, both correctly
  paused for explicit "yes").
- `AI_ROLES_POLICY.md` (repo root) documents the Chat/OpenCode/Hermes/Admin
  role matrix, Owner-approved 2026-08-02 — explicitly separates policy
  from what's actually enforced today.
- **Mode-based capability system (read/build/run) is now built** (Owner
  decision 2026-08-03, matching `AI_ROLES_POLICY.md`'s target). Enforced by
  reusing Hermes's own existing `-t/--toolsets` mechanism rather than a
  second permission layer — `MODE_TOOLSETS` in `hermes-runner/server.py`
  maps READ → `memory,web,todo,skills,fazle-core` only, BUILD → adds
  `file,code_execution`, RUN → adds `terminal`. Current mode lives in
  `/home/azim/hermes-runner/current_mode.txt`, re-read fresh on every `/run`
  call (no restart needed to change it), **fail-closed to READ** if the
  file is missing/unreadable/garbage — verified live (unauth request,
  missing-file case). `GET/POST /mode` on hermes-runner (proxied through
  `backend/src/routes/hermes.js`'s own `/mode` routes) let the admin read/
  change it; `HermesPage.jsx` shows a color-coded mode selector (slate/
  amber/red) with a browser `confirm()` before escalating to BUILD or RUN.
  Studied fazle-core's `modules/rbac`'s `check_permission()` first, as the
  prior version of this doc recommended — mirrored its fail-closed shape at
  a coarser grain (mode → toolset) since Hermes's own tools aren't as
  individually addressable as fazle-core's WhatsApp commands.
- **Persona picker is now built** (Owner decision 2026-08-03: per-session,
  stays admin-only). All 14 personas from `~/.hermes/config.yaml`'s
  `agent.personalities` (the doc previously said 12 — recount found 14) are
  mirrored as static duplicates in both `backend/src/routes/hermes.js`
  (`PERSONAS` array, for the `/personas` list endpoint) and
  `hermes-runner/server.py` (`PERSONAS` dict, for the actual preamble text)
  — same duplication-over-cross-calling pattern this project already uses
  for fazleTools.js/fazleBridge.js. Persona is chosen once per session (new
  `hermes_state.persona` column, migration `003_hermes_persona.sql`),
  locked in the UI once a session exists, unlocked on reset. The persona
  text is always followed by `SYSTEM_PREAMBLE` (the confirm-before-
  destructive safety contract) — a persona can change tone, never override
  that.

**Not built:** WhatsApp channel (shelved, see §5), voice/image tool-calling
(explicitly deferred, not urgent), the `/ws/` route (Owner decided: remove
it, not build it — nginx edit handed off, not yet confirmed applied).
Password-reset email delivery is built but needs a live `RESEND_API_KEY`
from the Owner to actually send (falls back to logging the link otherwise,
confirmed working via that fallback). Full detail in §3.

---

## 2. Gotchas — read before editing anything here

- **ESM project** (`"type": "module"` in both `package.json`s). No
  `require()`. To test a module standalone: `docker compose exec -T
  assistant-backend node -e "import('./src/whatever.js').then(...)"` — env
  vars and DB pools only work correctly *inside* the running container, not
  on the bare host.
- **Backend entrypoint is `index.js`, not `app.js`.** No file named
  `app.js` exists in this project. Don't assume it does.
- **No service-to-service auth secret exists between assistant-backend and
  fazleBridge.js's own HTTP routes** — those are per-user JWT only. If new
  server-side code inside assistant-backend needs fazle-core data, import
  `getFazleReaderPool()`/`fazleBridgeEnabled()` from `backend/src/db.js`
  directly (see `fazleTools.js`). **For a genuinely separate process**
  (like `fazle-mcp`, which is its own Python venv, not inside
  assistant-backend) the right pattern is different: log in as a
  dedicated low-privilege service account via the normal
  `POST /api/auth/login` endpoint and call the real HTTP API — that's what
  `fazle-mcp/server.py` does. Don't invent a shared secret for either case.
- **`ai_read_module_bridge_status` has no `status` column**, and this is
  more than cosmetic: confirmed live that it actively confuses Hermes's
  reasoning — it saw this one unrelated query fail and wrongly concluded
  fazle-core's whole backend was down, even for a different, working
  query. Real columns: `service_name, last_seen, queue_depth, metadata`.
  `fazleTools.js` was fixed to match; `fazleBridge.js`'s own
  `/module-bridge-status` HTTP route still has the old, broken reference —
  still out of scope until someone explicitly asks (fazle-core-adjacent).
- **`fpe_employees` has no `employee_name` column — the real column is
  `full_name`.** Cost real time: the first draft of the
  `ai_read_cash_transactions` view's join used `e.employee_name` and would
  have failed at `CREATE VIEW` time; only caught because a second,
  independent audit pass re-inspected the live schema (`\d fpe_employees`)
  instead of trusting the first pass's own DDL. **General lesson: always
  re-verify a proposed DDL's column references against a fresh `\d` right
  before handoff, even if you're confident — a first pass can be wrong in
  ways a second pass with fresh eyes catches.**
- **fazle-core KB change workflow, now proven end-to-end**: audit
  (read-only) → find the real answer in existing code/docs, don't guess →
  write a 6-part proposal (current/KB-ref/gap/implementation/risk/rollback)
  → get explicit Owner sign-off on anything touching fazle-core →
  edit fazle-core's KB *docs* directly (fine, it's documentation) → but
  **never run the DDL yourself** (KB hard constraint #7) → hand back exact
  copy-paste SQL for a human to run in an actual `psql` session (not at
  the bash prompt — this tripped the Owner up once; SQL needs `docker exec
  -it ... psql` first, then paste, not `docker exec ... psql -c "<multi-line
  SQL>"` shoved into a bash arg) → re-verify the *live* result yourself
  (`\d+ <view>`, `has_table_privilege`, a real query) rather than trusting
  a pasted terminal transcript at face value (a real paste in this project
  once visually appeared to be missing several SQL clauses — turned out to
  be a terminal-paste display artifact, not the actual bug, but only
  confirmed by querying the DB directly, not by re-reading the paste
  harder).
- **`management_decisions.md` (fazle-core,
  `knowledge_base/00_governance/`) is a large, strictly append-only
  chronological log** — new entries go at the very end of the file with a
  `## Title (date)` heading, following the existing entries' rich format
  (Status/Origin/What was done/Verification/Owner approval/Cross
  references). Don't insert mid-file, don't restructure existing entries.
- **fazle-core already has its own, separate, more mature admin-control
  system** — `modules/admin_directives` (persistent admin instructions,
  human-triggered only) + `modules/rbac` (`check_permission()`, confirmed
  by reading the code directly: genuinely fail-closed, no swallowed-
  exception path that could default to allowed). This is a *different*
  system from Hermes (reached via fazle-core's own WhatsApp admin
  commands, not this app's web page) but the *pattern* is directly
  relevant prior art for Hermes's still-unbuilt mode/approval system —
  see `management_decisions.md`'s "Unified Admin AI Engine" entry
  (2026-07-30) before designing that from scratch.
- **A policy doc about assistant-platform's own Chat/OpenCode/Hermes roles
  belongs in assistant-platform (`AI_ROLES_POLICY.md`, repo root), not
  fazle-core's KB** — even when asked to place it in
  `knowledge_base/00_governance/`. fazle-core's KB is about fazle-core's
  own systems; this app's internal role policy is a different system's
  concern, even though both get referenced from the same conversation.
- **OmniRoute's `auto` router is not reliable for tool-calling** — it can
  select a model (seen: one nicknamed "big-pickle") that emits raw
  pseudo-tool-call text into visible replies, or that simply can't use
  tools cleanly. `groq/llama-3.3-70b-versatile` is confirmed reliable
  *most* of the time, not always — `chat.js` retries the tool-enabled call
  up to 3x before giving up (bumped from 1 after live testing showed 1
  retry wasn't always enough), and even that isn't 100% (see §1). Don't
  read "3 retries" as "solved" — it's "acceptably mitigated."
- **`backend/.env` is gitignored and holds live secrets** (`FAZLE_DB_PASSWORD`,
  `OMNIROUTE_API_KEY`, `TAVILY_API_KEY`, `HERMES_RUNNER_SECRET`). Never
  `git add` it. Edit it directly on the VPS when a new key is needed.
- **No headless-browser/screenshot tool exists in this environment.**
  "Verified" in this doc and in commit messages means: clean build, clean
  container logs, and live `curl`/direct-SQL calls against the real
  endpoints/DB — never an actual rendered screenshot. Flag this explicitly
  when reporting UI work as done.
- **`/home/azim` vs `/home/azim/assistant-platform`** — Bash's cwd defaults
  to `/home/azim`. Use absolute paths or `cd` first, especially for `.env`
  reads, or you'll read the wrong file silently.
- **fazle-core (`/home/azim/core/`) is a separate, production system —
  never run DDL, restart it, or write to it yourself.** Docs are the one
  exception (see the KB workflow gotcha above) — edit them directly, but
  every write/restart/deploy command gets handed to a human, explicitly,
  one step at a time, with approval before each. This was tested for real
  across a full rollout (KB edits → DDL handoff → git handoff) and held up.
- **UFW does NOT block arbitrary new ports by default on this VPS —
  verified the hard way.** Binding `opencode serve` to `0.0.0.0:8091` as a
  connectivity test made it briefly reachable from the public internet
  before being caught and reverted within ~10 seconds. Only `22/80/443`
  (plus one unrelated pre-existing `0.0.0.0:8310`) were already public —
  **never assume UFW is a safety net for a newly-bound port; check with an
  actual external request, or don't bind to `0.0.0.0` at all.**
- **A container on a custom Docker network cannot reach a host service
  bound to that network's own bridge-gateway IP, on this VPS** — confirmed
  via direct TCP test (`TCP TIMEOUT`, not refused — a kernel/netfilter
  hairpin quirk, not a firewall rule, since the *same* gateway IP on port
  80/nginx is reachable fine). No root access was available to fix this at
  the iptables/conntrack level. **The working pattern**: run the host
  service on `127.0.0.1` only, add an nginx `location` block
  (IP-restricted via `allow <docker-subnet>/16; deny all;`, see
  `/opencode-internal/` and `/hermes-internal/` in the vhost) proxying to
  it, and reach it through nginx instead of directly. `host.docker.internal`
  is *also* unreliable here — for a multi-network container it resolved to
  the **default** bridge's gateway (`172.17.0.1`), not the actual named
  network's gateway (`172.25.0.1` for `assistant-network`) — get the real
  one via `docker inspect assistant-backend --format
  '{{json .NetworkSettings.Networks}}'`.
- **`fetch()` cannot override the `Host` header** (forbidden header per the
  Fetch spec — confirmed live: setting it is silently dropped, not an
  error). This matters once you're proxying to nginx by raw IP: nginx
  picks the vhost (`server_name assistant.iamazim.com`) by Host header, so
  `fetch('http://172.25.0.1:80/...')` lands on the *wrong* vhost every
  time, no error, just wrong behavior. The fix used here
  (`OPENCODE_URL`/`HERMES_RUNNER_URL`, `docker-compose.yml`): `extra_hosts`
  resolves the real domain name straight to the gateway IP for this
  container only, so `fetch()`'s own automatic Host-from-URL behavior just
  does the right thing — no header hackery, no switching to Node's raw
  `http` module.
- **⚠️ nginx's public-facing `/api/` location (port 443,
  `proxy_read_timeout`) is STILL `120s` as of 2026-08-03 — the widen-to-220s
  fix was diagnosed and handed off, but never actually confirmed applied,
  and a live check just now shows it's still 120s.** A previous version of
  this doc incorrectly said this was fixed — it wasn't; nobody had
  confirmed it. Hermes/OpenCode's own internal budgets (150–200s) are
  still longer than this, so a genuinely slow-but-working reply can still
  504 at the browser. **Re-verify with `grep proxy_read_timeout
  /etc/nginx/sites-available/assistant.iamazim.com` before assuming either
  way — don't repeat the mistake of trusting a diagnosis as if it were a
  confirmed fix.** See §5 item 1.
- **`hermes chat -c <name>` only RESUMES an existing session — it does not
  create-and-name one.** Sessions auto-generate an id (format
  `20260802_215222_0ecf80`); in `-Q` mode, `stdout` is pure reply text and
  the `session_id: ...` line is on `stderr` — parse it from there, then
  pass `--resume <id>` on every subsequent call. No `--personality`/
  `--persona` CLI flag exists — `hermes-runner/server.py` injects the
  behavioral contract as a text preamble on every message instead.
- **Hermes has a real, built-in dangerous-command approval gate** (`--yolo`
  bypasses it — confirmed via `--help`). Never pass `--yolo` for anything
  admin-facing-but-headless; without it, genuinely dangerous commands
  correctly can't execute in a no-TTY context (hang/timeout, not silent
  execution) — a real, if imperfect, safety property, not just the
  prompt-level contract.
- **`fazle_ai_reader` DOES let you `\dt`/list all 235+ raw production
  tables** — normal PostgreSQL catalog-visibility behavior, not a
  permission leak. **Always verify with `has_table_privilege('fazle_ai_reader',
  '<table>', 'SELECT')` or an actual `SELECT` attempt, never conclude
  anything from `\dt`/`\dv` output alone.** Confirmed twice now, on two
  different tables — raw tables correctly return `permission denied`.
- **`hermes mcp add`'s `--args` flag "must be the last option" is not a
  suggestion — it silently swallows everything after it, including a
  later `--env`.** Put `--env KEY=VAL ...` *before* `--args <path>` or env
  vars never reach the subprocess (crashes immediately, which just looks
  like "Connection closed"). To debug: bypass Hermes and manually pipe a
  raw `{"jsonrpc":"2.0","id":1,"method":"initialize",...}` message into
  the server's stdin directly — if that works but `hermes mcp add` still
  fails, the bug is in the invocation, not the server.
- **MCP tools registered via `hermes mcp add` are NOT automatically
  available to a session just because they're enabled in
  `~/.hermes/config.yaml`** — must be named explicitly in
  `-t`/`--toolsets` (server name alone, e.g. `fazle-core`) or the model
  correctly (no hallucination) reports it has no such tool.
- **Multi-tool-call Hermes requests can genuinely take 60–170s+** — each
  `hermes chat` invocation pays a fresh MCP subprocess startup cost (new
  Python venv + a login round-trip for `fazle-mcp`) on top of actual
  reasoning time. Not a bug; budget for it (this is why the `/api/` timeout
  needed widening — see the incident note below, now fixed).
- **The installed `mcp` Python SDK is v2.0.0**, which renamed `FastMCP` to
  `MCPServer` (`mcp.server.mcpserver`, not `mcp.server.fastmcp`). The
  decorator API (`@mcp.tool()`) is otherwise the same.
- **A `sed -i 'N,Md'` line-range deletion on `/etc/nginx/sites-available/
  assistant.iamazim.com` is not idempotent — running the same command
  twice is a real, if silent, way to corrupt the file** (real incident,
  2026-08-03). The intended edit was "delete the unused `/ws/` block,
  lines 76–85." The first run did exactly that. `nginx -t` then failed for
  an unrelated reason (a genuine syntax issue elsewhere at the time), so
  `&& systemctl reload nginx` never ran (good — the live running nginx
  process kept serving the last valid config the whole time, site never
  went down) — but re-running the identical `sed` command a second time
  deleted 10 *more* lines starting from the now-shifted line 76, which by
  then was the middle of the next block (`/omniroute/v1/`), silently
  eating its opening 8 lines. Recovered by reading the full live file,
  reconstructing the missing block from what this doc/session already knew
  its content to be, diffing the reconstruction against the corrupted file
  to confirm the change was purely additive, and handing back a full-file
  `cp` (with a `.broken-backup-<date>` taken first) instead of another
  line-numbered `sed`. **Lesson: after any `nginx -t` failure, re-read the
  file (or at least re-run the `grep`/`sed -n` that produced the original
  line numbers) before re-attempting a line-range edit — never blindly
  re-run the same line-numbered command twice.** For any future nginx
  edit, prefer a full-file replace from a known-good reconstruction over a
  second targeted line-range edit once the first attempt has already
  failed once.

---

## 3. Gaps — built but incomplete or dead

| Item | State | File(s) |
|---|---|---|
| **nginx `/api/` timeout still 120s** | Diagnosed, handed off *again* 2026-08-03 (combined with the `/ws/` removal into one sudo command) — **still not confirmed applied as of this doc revision, re-check before assuming** | `/etc/nginx/sites-available/assistant.iamazim.com` line 73 |
| **`/ws/` nginx route removal** | Owner decided: remove, not build. Sudo command handed off together with the timeout fix above — **not yet confirmed applied** | nginx config lines 76–85 |
| Voice/image tool-calling | Explicitly deferred (Owner decision 2026-08-03) — not a bug, just not built | `backend/src/routes/chat.js` `/send-audio`, `/send-image` |

**Done, not gaps anymore (as of 2026-08-03):** fazle-MCP for Hermes;
`ai_read_cash_transactions` (view live, all 3 code paths wired and verified
with real data); `fazleBridge.js`'s `/module-bridge-status` column bug; BYO
API keys in chat.js (no-tools path only, by design); `usage/free-remaining`
(real 50/day warn-only quota, not a placeholder); Hermes persona picker;
Hermes READ/BUILD/RUN mode gate; nginx `/api/` timeout (120s→220s,
confirmed live via direct `grep` after Owner ran the sudo command);
**password-reset email delivery** — `RESEND_API_KEY` provided, domain
`assistant.iamazim.com` verified in Resend (MX/SPF/DKIM DNS records
confirmed resolving, then proven by a real send to a non-owner address,
not just DNS propagation), `RESEND_FROM=noreply@assistant.iamazim.com` set,
full flow tested end-to-end through the real app with a real registered
user. No longer sandbox-restricted to the Owner's own inbox.

---

## 4. Architecture (built — this is now the live shape, not a target)

```
        assistant.iamazim.com (one frontend, three separate pages/tabs)
                               |
                     assistant-backend (gateway, Docker)
        /                      |                        \
  Chat page              OpenCode page                Hermes page
 (OmniRoute +          proxy -> opencode serve      proxy -> hermes-runner.service
 tool-calling,          (host systemd, via            (host systemd, via
  12 tools,           nginx /opencode-internal/)     nginx /hermes-internal/,
  all users)                                        admin-only, + fazle-mcp)
        \                      |                        /
                          OmniRoute (free → local → paid cascade,
                           already live: Groq, Gemini, Ollama, Moonshot, DeepSeek)
```

Three separate pages, not a mode switcher inside Chat — deliberate, so
capability tiers stay visually/structurally distinct. Both host-level
services are reached through nginx, never a direct container→host route.
Chat and Hermes now draw from the **same 11 fazle-core read endpoints**
(`fazleBridge.js`) via two independent code paths (`fazleTools.js` direct
DB, `fazle-mcp` via HTTP+login) — kept deliberately duplicated rather than
one calling the other, for isolation.

---

## 5. Next queue, in order

**All queued fixes from the 2026-08-03 gap-fix pass are now closed.**
Nothing left in this queue as of this revision — see §2's `sed -i` gotcha
if this file is ever edited again via a line-numbered command.

**Deferred by explicit Owner decision, not queued:** voice/image
tool-calling (Problem 10) — same 12 tools as text chat were considered and
declined for now, revisit if raised again.

**Shelved, not queued:** Hermes on WhatsApp. Owner has no Meta WhatsApp
Business number, new registrations currently Meta-restricted — don't
re-propose unless that changes or the Owner raises it.

---

## 6. Feasibility notes (still accurate)

- **Reusing fazle-core's WhatsApp number/webhook for Hermes: don't.**
  Production collision risk, not a technical impossibility. Moot for now
  — see shelved WhatsApp item in §5.
- **Appearing inside the Owner's own "Message Yourself" WhatsApp thread:
  not possible** for any third-party bot — reserved for Meta AI itself.
- **Full terminal access from a web page: built, admin-gated, confirm-
  before-destructive verified live twice** (a service restart request, a
  file-write request). The remaining real risk isn't the gate itself —
  it's that this pipeline is still new; keep testing on low-stakes tasks,
  and don't widen `hermes-runner`'s toolset (`HERMES_TOOLSETS`) without a
  reason.
- **A full governance rollout touching fazle-core (proposal → Owner
  approval → KB docs → DDL → verification) has now been done once, for
  real, end to end** — the pattern in the KB-workflow gotcha above is
  proven, not theoretical. Reuse it for the next fazle-core-touching
  change rather than re-deriving the process.

---

## 7. fazle-core WhatsApp persona reply — proposal in progress (2026-08-03, separate from this repo)

Owner asked for role-based WhatsApp reply personas (HR Officer, Client-
facing, Recruitment, Lawyer, funny) for fazle-core's WhatsApp channels
(bridge1/bridge2 AND social_auto_reply's Facebook/Meta WhatsApp Business
API — confirmed both, "for all WhatsApp platform"). This is entirely a
fazle-core change, not an assistant-platform one — tracked in a formal
6-part KB-first proposal at `/home/azim/core/proposal_hermes_whatsapp_persona_reply_20260803.md`,
not yet approved, no fazle-core code changed. Read that file for full
detail if resuming this work. Two things worth knowing without re-reading
the whole proposal:

- **fazle-core does not use OmniRoute** — confirmed by reading its `.env`
  directly. It has its own separate, direct provider credentials
  (`GROQ_API_KEY`, `GITHUB_TOKEN`, local `OLLAMA_URL`). Don't design
  anything assuming a shared gateway with assistant-platform.
- **fazle-core already has a proven identity/persona-adjacent system**
  (`modules/identity_brain` + `modules/role_classifier`) that resolves
  every WhatsApp contact to a role (`vip_client`, `employee`, `candidate`,
  `unknown`, etc.) and injects a role-specific Bangla tone directive into
  the LLM prompt — but only for the `message_router` (bridge1/bridge2)
  path, not `social_auto_reply`. The proposal's real scope turned out to
  be much narrower than first drafted once this was found — extend/wire,
  don't rebuild.
- One open architecture question blocks Phase 4 specifically (an
  assistant-platform admin-page toggle for a "full reply" permission
  tier): assistant-platform's connection to fazle-core has been strictly
  **read-only** since Phase 1d (three independent enforcement layers) —
  a working toggle needs a real write path that doesn't exist today. Not
  decided yet which shape that write path takes.
