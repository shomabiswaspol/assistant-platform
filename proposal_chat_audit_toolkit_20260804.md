# Proposal: Chat Audit Toolkit Wiring

**Date:** 2026-08-04 · **Status: APPROVED & IMPLEMENTED (design amended during build) — code done, not yet deployed.**
**Author:** Claude (assistant-platform), during a review of the "Priority 1" queue item "Chat audit toolkit wiring"
**Follows:** fazle-core's KB-First Policy — 6-part structure, stop for management approval before any production change.

**Owner approval:** "Approve as designed — admin-gated (isAdmin-only) port of the 7 read-only audit tools into Chat's tool list" (2026-08-04).

**Design amendment found during implementation, before any code was written
against the original plan:** §4 as originally proposed ("port
`audit_tools.py` straight into `backend/src/tools/`") turned out to be
non-functional as designed — `assistant-backend` runs inside a Docker
container with no bind-mounted filesystem access to
`/home/azim/assistant-platform` or `/home/azim/core` and no Docker socket, so
a JS port sitting in that container would have no filesystem to search. This
was surfaced and a fix chosen (HTTP bridge via hermes-runner, which already
runs on the bare host and already has an authenticated channel to
assistant-backend) before implementation proceeded — see the amended §4
below for what was actually built.

**What's done:** all code (host-side Python port + HTTP route on
hermes-runner, Node HTTP client + admin-gated wiring in Chat), all tests
(13 new hermes-runner tests, 9 new assistant-platform tests, 95 total tests
across both repos passing, zero regressions), and a live end-to-end smoke
test against a real hermes-runner instance (real grep/git/file-read results,
real `.env`-path denial, real 401 without auth). **Not done:**
`CHAT_AUDIT_TOOLS_ENABLED` is off by default (staged rollout, per §4) and
neither hermes-runner nor the assistant-backend container has been restarted
to pick up the change — both are explicitly left for the Owner, per this
project's restart-is-manual convention.

---

## 1. Current production behavior

Chat (`assistant-platform/backend/src/routes/chat.js`) is reachable by any
user passing `requireAuth` + `requireApproved`
([auth.js:21](backend/src/middleware/auth.js#L21)) — i.e. **any approved
user, not just admin**. Its tool surface is `fazleToolDefinitions` (10
read-only fazle-core DB queries, `backend/src/tools/fazleTools.js`) +
`searchToolDefinitions` (Tavily web search, `searchTools.js`) — both
pure-JS.

Hermes (`routes/hermes.js`) is separately gated behind `requireAdmin`
([hermes.js:9](backend/src/routes/hermes.js#L9)) and proxies to
`hermes-runner.service` (Python), which alone talks to the fazle-mcp
stdio MCP server exposing `audit_tools.py`'s 7 read-only tools
(`audit_search_code`, `audit_search_docs`, `audit_search_kb`,
`audit_search_logs`, `audit_read_file`, `audit_git_status`,
`audit_recent_commits`) — rooted to an explicit allowlist
(`AUDIT_ROOTS`), argv-list-only subprocess calls (no shell), and
secret/phone redaction on log output.

Chat has no equivalent — a Chat user today cannot search fazle-core/
assistant-platform source, docs, or logs, read a specific file, or check
git status/history. This is the documented gap driving this proposal.

## 2. Knowledge Base reference

`fazle-mcp/audit_tools.py:24`:
```
# See metrics_tools.py's identical constant/comment: Hermes's entire surface
# is admin-gated end-to-end today (hermes.js requireAdmin) — this is only
# correct as long as that holds.
_HERMES_IS_ADMIN_CONTEXT = True
```

`knowledge_base/00_governance/management_decisions.md` → "Hermes Phase
5B" (2026-08-04, the **same day** this gap was reviewed): lists "Chat
audit-toolkit wiring" explicitly under *"No speculative expansion...
explicitly out of scope for this phase."*

## 3. Gap analysis

| | KB/code says | If wired naively into Chat |
|---|---|---|
| Admin-only assumption | `_HERMES_IS_ADMIN_CONTEXT = True`, load-bearing, holds only because the sole caller (Hermes) is `requireAdmin` | Broken — Chat's caller population is `requireApproved` (non-admin included), so source-code search/read, redacted-log search, and git history become reachable by any approved-but-non-admin user |
| Implementation surface | Python-only, stdio MCP, no HTTP endpoint | Cannot be "wired" as a registration change — requires a same-logic reimplementation in Node, mirroring this repo's existing `fazleTools.js`/`fazleBridge.js` duplication pattern |
| Scope status | N/A | Named explicitly out-of-scope by an Owner decision made the same day this gap was found — building without a fresh explicit go-ahead repeats the "parallel-track, undocumented scope creep" failure mode already flagged in the fazle-core OS roadmap |

**Open question requiring an Owner decision:** should the audit toolkit
be exposed to Chat's full `requireApproved` population, or only to
Chat's admin users? This proposal recommends the latter (§4) but the
Owner may prefer a narrower or different design (e.g. a separate
admin-only Chat mode, or declining entirely).

## 4. Implementation (as actually built — amended from the original plan)

**Blocker found before writing the originally-planned JS port:**
`assistant-backend` runs inside a Docker container
([docker-compose.yml](docker-compose.yml)) with no bind mount for
`/home/azim/assistant-platform` or `/home/azim/core` and no Docker socket
access. A literal JS port of `audit_tools.py` living in `chat.js`'s
container would have no filesystem to search — every call would fail at
runtime. Surfaced and resolved before implementation proceeded, not after.

**What was built instead** — an HTTP bridge through hermes-runner, which
already runs on the bare host (real filesystem access) and already has an
authenticated HTTP channel to `assistant-backend` (`hermesRunnerUrl` +
`hermesRunnerSecret`, the same one `routes/hermes.js` uses for `/mode` and
`/run`):

- `hermes-runner/audit_tools.py` *(new)* — host-side port of the 7
  approved read-only functions, preserving every safety property 1:1:
  `AUDIT_ROOTS` allowlist + realpath containment check,
  `DENY_PATH_SUBSTRINGS`, `EXCLUDE_DIRS`, `SECRET_PATTERNS`/phone
  redaction, `MAX_FILE_BYTES`, argv-list `subprocess.run(..., shell=False)`.
  Duplicated rather than cross-imported from `fazle-mcp/audit_tools.py`
  (separate deployable units/venvs) — matches this project's existing
  duplication convention (e.g. the `PERSONAS` dict).
- `hermes-runner/server.py` — new `POST /audit {"tool", "args"}` route,
  same Bearer-secret auth as `/mode`/`/run`; dispatch logic in a pure,
  independently-testable `_handle_audit()` function; tool name checked
  against a closed allowlist (`audit_tools.AUDIT_TOOLS`), never arbitrary
  code execution.
- `backend/src/tools/auditTools.js` *(new)* — thin HTTP client to
  hermes-runner's `/audit`, exposing the same 7 tool schemas Chat's model
  sees.
- `backend/src/routes/chat.js` — `auditToolDefinitions` added to the
  per-request tool list **only when `isAdmin` is true** (`toolsFor()`,
  replacing the old module-level `allTools` constant), so non-admin
  approved users never see these tools offered to the model at all.
  Execution is gated a second time in `executeToolCall` (defense in
  depth). Whole feature additionally gated behind `CHAT_AUDIT_TOOLS_ENABLED`
  (env flag, default **off** — staged rollout).
- No write/execute/delete/deploy/restart tool is exposed anywhere in this
  chain — scope stays identical to the approved 7 read-only tools.
  `audit_lookup_whatsapp_messages` (DB-backed, 8th tool in the original
  Python toolkit) stays deliberately excluded — regression-tested in both
  `test_audit_endpoint.py` and `auditTools.test.js`.

**Important asymmetry, documented in code comments at both ends:** the
Bearer secret on `/audit` authenticates "this is assistant-backend," not
"this specific end-user is an admin" — both admin and non-admin Chat
requests share the same backend process and secret. The real admin-only
boundary is the `isAdmin` check in `chat.js`, the same app-side pattern
already used for PII masking in `fazleTools.js`/`piiMask.js`.

## 5. Risk assessment

- **Technical risk: low, verified.** Pure port of already-audited logic
  plus one new host-side HTTP route reusing an existing auth pattern; no
  schema/DB change, no write path. Verified with a live end-to-end smoke
  test (real grep/git/file-read results through the actual HTTP chain,
  real `.env`-path denial, real 401 without auth) in addition to 22 new
  automated tests (13 Python + 9 Node), 95 total across both repos, zero
  regressions.
- **Process risk: resolved.** Owner approval obtained 2026-08-04, same
  day as the out-of-scope note this proposal's §2/§3 flagged — the prior
  "no speculative expansion" constraint was about building this
  *without* a fresh decision, not a permanent block.
- **Drift risk:** three independent implementations of the same
  rooted/redaction logic now exist (`fazle-mcp/audit_tools.py`,
  `hermes-runner/audit_tools.py`, and their shared safety properties
  mirrored in `auditTools.js`'s tool schemas). Each carries a code
  comment pointing at the others; no automated sync check exists yet — if
  the allowlist/redaction rules ever change, all three need updating by
  hand.

## 6. Rollback strategy

Purely additive across both repos:
- `hermes-runner`: delete `audit_tools.py`, remove the `/audit` block +
  `_handle_audit()` from `server.py`, remove `tests/test_audit_endpoint.py`.
- `assistant-platform`: delete `auditTools.js` + `auditTools.test.js`,
  revert `chat.js`'s `toolsFor()`/`executeToolCall` changes.
- Fastest rollback with no code change at all: set
  `CHAT_AUDIT_TOOLS_ENABLED=false` (already the default) — Chat instantly
  stops offering or executing any audit tool, everything else in this
  proposal can stay deployed inertly.
- No schema, no data, no migration anywhere in this feature at any point.

---

## For the Owner to run

Code is done and tested; nothing below has been executed by me.

**1. Restart hermes-runner** (new `/audit` route needs the process reloaded):
```bash
systemctl --user restart hermes-runner.service   # or this project's equivalent
curl -s http://127.0.0.1:8093/health              # sanity check after restart
```

**2. Turn the feature on** — add to `assistant-platform/backend/.env`:
```
CHAT_AUDIT_TOOLS_ENABLED=true
```
then rebuild/restart the container:
```bash
cd /home/azim/assistant-platform
docker compose up -d --build assistant-backend
```

**3. Commit + push, when ready** (both repos have uncommitted changes as
of this writing — `git status` in `/home/azim/hermes-runner` and
`/home/azim/assistant-platform` to review first).

Until steps 1-2 are both done, the code ships inert: `chat.js` never adds
the audit tools to any request (flag off), so nothing changes for any
Chat user, admin or not.
