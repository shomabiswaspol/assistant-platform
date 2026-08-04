import { config } from '../config.js';

// Chat's client for the 7 read-only audit tools (search code/docs/kb/logs,
// read file, git status/commits), added 2026-08-04 -- see
// proposal_chat_audit_toolkit_20260804.md for the full 6-part proposal.
//
// The actual filesystem/git logic lives in ~/hermes-runner/audit_tools.py,
// NOT here: assistant-backend runs inside a Docker container with no
// bind-mounted access to /home/azim/assistant-platform or /home/azim/core
// and no Docker socket, so a straight JS port would have no filesystem to
// search. hermes-runner already runs on the bare host (that's the whole
// reason it exists, per its own server.py docstring) and already has an
// authenticated HTTP channel to this container (hermesRunnerUrl +
// hermesRunnerSecret, the same one routes/hermes.js uses for /mode and
// /run) -- this module is a thin client over that channel's new /audit
// route, not a second implementation of the safety logic.
//
// IMPORTANT — this is NOT itself the admin/non-admin boundary. The Bearer
// secret below authenticates "this is assistant-backend", not "this
// request is on behalf of an admin user" — both admin and non-admin Chat
// requests share the same backend process and the same secret. The actual
// gate is in routes/chat.js: auditToolDefinitions is only added to the
// model's tool list, and executeAuditTool is only ever called, when
// req.user.role === 'admin'. Mirrors the existing isAdmin-gating pattern in
// fazleTools.js/piiMask.js, where the downstream data source (there,
// Postgres; here, hermes-runner) can't itself distinguish admin from
// non-admin callers either.
//
// Staged rollout: the whole toolset is additionally gated behind
// CHAT_AUDIT_TOOLS_ENABLED (default off, per the approved proposal) —
// checked in chat.js before these definitions are ever added, not here.

const AUDIT_TIMEOUT_MS = 15000;

export const auditToolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'audit_search_code',
      description: "Search source code for a literal string (grep -rn), rooted to an approved repo. root: 'assistant-platform' or 'fazle-core'.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Literal text to search for' },
          root: { type: 'string', enum: ['assistant-platform', 'fazle-core'], description: "Repo to search (default 'assistant-platform')" },
          max_results: { type: 'integer', description: 'Max matching lines to return (default 20, max 100)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'audit_search_docs',
      description: 'Search markdown documentation for a literal string, rooted to an approved repo.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Literal text to search for' },
          root: { type: 'string', enum: ['assistant-platform', 'fazle-core'], description: "Repo to search (default 'assistant-platform')" },
          max_results: { type: 'integer', description: 'Max matching lines to return (default 20, max 100)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'audit_search_kb',
      description: "Search fazle-core's knowledge_base/ directory for a literal string.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Literal text to search for' },
          max_results: { type: 'integer', description: 'Max matching lines to return (default 20, max 100)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'audit_search_logs',
      description: "Search a known log ('backend', 'fazle-core', or 'hermes-runner') for a literal string (or tail it if query is empty). Secrets and phone numbers are redacted from results.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Literal text to search for (omit to just tail the log)' },
          log: { type: 'string', enum: ['backend', 'fazle-core', 'hermes-runner'], description: "Which log to search (default 'backend')" },
          max_lines: { type: 'integer', description: 'Max lines to return (default 100, max 500)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'audit_read_file',
      description: 'Read a file (optionally a bounded line range) from an approved root. Refuses secret/credential-shaped paths and enforces a size cap.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path relative to the chosen root (or an absolute path already inside it)' },
          root: { type: 'string', enum: ['assistant-platform', 'fazle-core'], description: "Which repo root the path is relative to (default 'assistant-platform')" },
          start_line: { type: 'integer', description: 'Optional 1-based start line for a bounded read' },
          end_line: { type: 'integer', description: 'Optional 1-based end line for a bounded read' },
          max_lines: { type: 'integer', description: 'Max lines to return (default 500, max 2000)' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'audit_git_status',
      description: "Read-only git status for an approved repo ('assistant-platform' or 'fazle-core').",
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', enum: ['assistant-platform', 'fazle-core'], description: "Which repo (default 'assistant-platform')" },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'audit_recent_commits',
      description: 'Read-only recent commit log for an approved repo.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', enum: ['assistant-platform', 'fazle-core'], description: "Which repo (default 'assistant-platform')" },
          limit: { type: 'integer', description: 'Max commits to return (default 10, max 100)' },
        },
      },
    },
  },
];

const AUDIT_TOOL_NAMES = new Set(auditToolDefinitions.map((t) => t.function.name));

export function isAuditTool(name) {
  return AUDIT_TOOL_NAMES.has(name);
}

export async function executeAuditTool(toolName, args = {}) {
  if (!isAuditTool(toolName)) {
    return { error: `unknown audit tool: ${toolName}` };
  }
  if (!config.hermesRunnerSecret) {
    return { error: 'audit toolkit not configured (HERMES_RUNNER_SECRET missing)' };
  }
  try {
    const resp = await fetch(`${config.hermesRunnerUrl}/audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.hermesRunnerSecret}`,
      },
      body: JSON.stringify({ tool: toolName, args }),
      signal: AbortSignal.timeout(AUDIT_TIMEOUT_MS),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { error: data.error || `audit tool request failed (status ${resp.status})` };
    }
    return data;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`auditTools ${toolName} error:`, err.message);
    return { error: 'hermes-runner unreachable (audit toolkit)' };
  }
}
